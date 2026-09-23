import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export const PASSWORD_MIN_LENGTH = 8;
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const BCRYPT_COST = 12;

/** Campos de usuario que se pueden devolver por la API: nunca el hash. */
const publicFields = { id: true, email: true, role: true, isRoot: true, twoFactorEnabled: true, createdAt: true } as const;

export type PublicUser = {
  id: number;
  email: string;
  role: string;
  isRoot: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
};

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

export const listUsers = (): Promise<PublicUser[]> =>
  prisma.user.findMany({ select: publicFields, orderBy: { createdAt: "asc" } });

export const getUserById = (id: number): Promise<PublicUser | null> =>
  prisma.user.findUnique({ where: { id }, select: publicFields });

const countAdmins = () => prisma.user.count({ where: { role: "admin" } });

/**
 * Cierra todas las sesiones de un usuario borrando sus refresh tokens. Se llama
 * cuando cambia su contrasena o su rol: las credenciales viejas no deben seguir
 * sirviendo, y un cambio de rol debe reflejarse en el siguiente access token.
 */
export const revokeSessions = (userId: number) => prisma.refreshToken.deleteMany({ where: { userId } });

export const createUser = async (input: {
  email: string;
  password: string;
  role?: string;
}): Promise<PublicUser> => {
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role ?? "user",
      },
      select: publicFields,
    });
  } catch (error) {
    // P2002: violacion de la restriccion unica sobre email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserServiceError("Email already registered", 409);
    }
    throw error;
  }
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
  // Los refresh tokens caen en cascada (onDelete: Cascade en el esquema).
  await prisma.user.delete({ where: { id } });
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

  await prisma.user.delete({ where: { id: userId } });
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
