import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import {
  WorkspaceSummary,
  assertCanAddMember,
  createPendingAccount,
  createWorkspace,
  deliverInvitation,
  getWorkspaceRole,
  listUserWorkspaces,
  releaseWorkspacesOf,
} from "./workspaceService";

export const PASSWORD_MIN_LENGTH = 8;
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const BCRYPT_COST = 12;

/** Campos de usuario que se pueden devolver por la API: nunca el hash. */
const publicFields = {
  id: true,
  email: true,
  role: true,
  isRoot: true,
  twoFactorEnabled: true,
  createdAt: true,
  activatedAt: true,
} as const;

export type PublicUser = {
  id: number;
  email: string;
  role: string;
  isRoot: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  /** Null mientras la invitacion esta pendiente. */
  activatedAt: Date | null;
};

/** Espacio al que pertenece una cuenta, tal como lo ve el admin de plataforma. */
export type ManagedMembership = { id: number; name: string; role: "owner" | "member" };

/** Lo que lista el admin de plataforma: la cuenta y los espacios en los que esta, con su rol en cada uno. */
export type ManagedUser = PublicUser & { workspaces: ManagedMembership[]; workspaceCount: number };

/** La sesion actual, con sus espacios: el panel arranca con una sola peticion. */
export type CurrentUser = PublicUser & { workspaces: WorkspaceSummary[] };

/** Error de negocio con el codigo HTTP que le corresponde. */
export class UserServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UserServiceError";
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

export const listUsers = async (): Promise<ManagedUser[]> => {
  const users = await prisma.user.findMany({
    select: {
      ...publicFields,
      memberships: {
        where: { workspace: { deletedAt: null } },
        select: { role: true, workspace: { select: { id: true, name: true } } },
        orderBy: { workspaceId: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map(({ memberships, ...user }) => {
    const workspaces = memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role }));
    return { ...user, workspaces, workspaceCount: workspaces.length };
  });
};

export const getUserById = (id: number): Promise<PublicUser | null> =>
  prisma.user.findUnique({ where: { id }, select: publicFields });

export const getCurrentUser = async (id: number): Promise<CurrentUser | null> => {
  const user = await getUserById(id);
  return user ? { ...user, workspaces: await listUserWorkspaces(user) } : null;
};

const countAdmins = () => prisma.user.count({ where: { role: "admin" } });

/**
 * Cierra todas las sesiones de un usuario borrando sus refresh tokens. Se llama
 * cuando cambia su contrasena o su rol: las credenciales viejas no deben seguir
 * sirviendo, y un cambio de rol debe reflejarse en el siguiente access token.
 */
export const revokeSessions = (userId: number) => prisma.refreshToken.deleteMany({ where: { userId } });

export const ACCOUNT_MODES = ["own", "join"] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export type CreateUserInput = {
  email: string;
  /**
   * Opcional. Sin contrasena la cuenta nace pendiente y recibe un enlace para
   * elegirla, que es lo que usa el panel: asi nadie conoce la contrasena de otro.
   */
  password?: string;
  role?: string;
  /** `own`: la cuenta recibe su propio espacio. `join`: entra al espacio `workspaceId`. */
  mode?: AccountMode;
  workspaceName?: string;
  workspaceId?: number;
  workspaceRole?: "owner" | "member";
  /** Quien da de alta la cuenta: solo puede sumarla a espacios que administra. */
  requester: { id: number; role: string };
  locale?: "es" | "en";
};

export type CreateUserResult = { user: PublicUser; emailSent: boolean; invitePath?: string };

/**
 * Alta de una cuenta por el admin de plataforma. Siempre acaba dentro de un
 * espacio: el suyo propio o uno ya existente (el admin administra todos).
 * Nunca, como antes, con acceso a todo.
 */
export const createUser = async (input: CreateUserInput): Promise<CreateUserResult> => {
  const mode = input.mode ?? "own";
  let joinWorkspaceName: string | undefined;

  if (mode === "join") {
    if (!input.workspaceId) throw new UserServiceError("workspaceId is required to join a workspace", 400);
    if ((await getWorkspaceRole(input.requester, input.workspaceId)) !== "owner") {
      throw new UserServiceError("You can only add people to workspaces you manage", 403);
    }
    await assertCanAddMember(input.workspaceId);
    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId } });
    joinWorkspaceName = workspace?.name;
  }

  // bcrypt fuera de la transaccion: tarda cerca de un segundo y no debe tener filas bloqueadas.
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  let workspaceName: string;
  let user: PublicUser;
  try {
    ({ user, workspaceName } = await prisma.$transaction(async (tx) => {
      const created = passwordHash
        ? await tx.user.create({ data: { email: input.email, passwordHash, activatedAt: new Date() } })
        : await createPendingAccount(input.email, tx);
      if (input.role && input.role !== created.role) {
        await tx.user.update({ where: { id: created.id }, data: { role: input.role } });
      }

      if (mode === "join") {
        await tx.workspaceMember.create({
          data: { workspaceId: input.workspaceId!, userId: created.id, role: input.workspaceRole ?? "member" },
        });
        return { user: (await tx.user.findUniqueOrThrow({ where: { id: created.id }, select: publicFields })), workspaceName: joinWorkspaceName ?? "" };
      }
      const workspace = await createWorkspace(created.id, input.workspaceName, input.email, tx);
      return { user: await tx.user.findUniqueOrThrow({ where: { id: created.id }, select: publicFields }), workspaceName: workspace.name };
    }));
  } catch (error) {
    // P2002: violacion de la restriccion unica sobre email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserServiceError("Email already registered", 409);
    }
    throw error;
  }

  if (user.activatedAt) return { user, emailSent: false };
  return { user, ...(await deliverInvitation(user, workspaceName, input.locale ?? "es")) };
};

export const updateUser = async (
  id: number,
  changes: { role?: string; password?: string },
): Promise<PublicUser> => {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new UserServiceError("User not found", 404);

  if (existing.isRoot && changes.role && changes.role !== "admin") {
    throw new UserServiceError("The root account cannot be demoted", 403);
  }

  // Quedarse sin ningun admin dejaria el servicio sin quien lo administre.
  if (changes.role && changes.role !== "admin" && existing.role === "admin" && (await countAdmins()) <= 1) {
    throw new UserServiceError("Cannot demote the last admin", 409);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(changes.role && { role: changes.role }),
      ...(changes.password && { passwordHash: await hashPassword(changes.password) }),
    },
    select: publicFields,
  });

  if (changes.password || changes.role) await revokeSessions(id);
  return user;
};

export const deleteUser = async (id: number, requesterId: number): Promise<void> => {
  if (id === requesterId) {
    throw new UserServiceError("You cannot delete your own account", 409);
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new UserServiceError("User not found", 404);
  await assertDeletable(existing);
  await deleteAccount(id);
};

/**
 * Borra la cuenta junto con los espacios en los que estaba sola. Los refresh
 * tokens y las membresias caen en cascada (onDelete: Cascade en el esquema).
 */
const deleteAccount = async (id: number) => {
  const releaseWorkspaces = await releaseWorkspacesOf(id);
  await prisma.$transaction(async (tx) => {
    await releaseWorkspaces(tx);
    await tx.user.delete({ where: { id } });
  });
};

/** Reglas comunes a borrar una cuenta, la haga un admin o su titular. */
const assertDeletable = async (user: { role: string; isRoot: boolean }) => {
  if (user.isRoot) throw new UserServiceError("The root account cannot be deleted", 403);
  if (user.role === "admin" && (await countAdmins()) <= 1) {
    throw new UserServiceError("Cannot delete the last admin", 409);
  }
};

/**
 * El titular borra su propia cuenta. Se pide la contrasena, y el segundo factor
 * si lo tiene activo, para que una sesion olvidada abierta no baste.
 */
export const deleteOwnAccount = async (
  userId: number,
  password: string,
  verifySecondFactor: (userId: number) => Promise<boolean>,
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserServiceError("User not found", 404);
  await assertDeletable(user);

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new UserServiceError("Password is incorrect", 400);
  }
  if (user.twoFactorEnabled && !(await verifySecondFactor(userId))) {
    throw new UserServiceError("Invalid verification code", 400);
  }

  await deleteAccount(userId);
};

/** Confirma la contrasena del titular antes de una accion sensible. */
export const assertPassword = async (userId: number, password: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserServiceError("User not found", 404);
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new UserServiceError("Password is incorrect", 400);
  }
};

export const changeOwnPassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserServiceError("User not found", 404);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UserServiceError("Current password is incorrect", 400);

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new UserServiceError("The new password must be different", 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  // Cambiar la contrasena cierra la sesion en el resto de dispositivos.
  await revokeSessions(userId);
};
