import { Prisma, WorkspaceRole } from "@prisma/client";
import logger from "../config/logger";
import { prisma } from "../config/prisma";
import { deleteLogsInBatches } from "./logService";
import { sendInvitation, sendMembershipNotice } from "./passwordResetService";
import { getSetting } from "./settingsService";
import { UserServiceError } from "./userService";

/**
 * Espacios de trabajo: la unidad de aislamiento de MCLog.
 *
 * Logs, API keys y alertas pertenecen a un espacio y solo los ven sus miembros.
 * El dueño (owner) lo administra; el miembro (member) solo observa. Un espacio
 * tiene siempre al menos un dueño: sin el, nadie podria gestionarlo.
 *
 * Por encima de los espacios esta el admin de plataforma (rol `admin`, la
 * cuenta root incluida): administra la aplicacion entera, asi que es dueño
 * implicito de todos los espacios sin figurar como miembro de ninguno.
 */

export const WORKSPACE_ROLES = ["owner", "member"] as const;
export const WORKSPACE_NAME_MAX = 120;

export type WorkspaceSummary = { id: number; name: string; role: WorkspaceRole; memberCount: number; createdAt: Date };

export type WorkspaceMemberView = {
  userId: number;
  email: string;
  role: WorkspaceRole;
  /** true mientras la persona no haya elegido su contrasena con el enlace de invitacion. */
  pending: boolean;
  twoFactorEnabled: boolean;
  joinedAt: Date;
};

const notFound = () => new UserServiceError("Workspace not found", 404);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limites de la configuracion antes de sumar a alguien a un espacio: miembros
 * totales (pendientes incluidos) y altas en las ultimas 24 h. 0 = sin limite.
 */
export const assertCanAddMember = async (workspaceId: number, db: Prisma.TransactionClient = prisma) => {
  const maxMembers = getSetting("maxWorkspaceMembers");
  if (maxMembers > 0 && (await db.workspaceMember.count({ where: { workspaceId } })) >= maxMembers) {
    throw new UserServiceError(`This workspace has reached its limit of ${maxMembers} members`, 409);
  }
  const perDay = getSetting("maxInvitationsPerDay");
  if (
    perDay > 0 &&
    (await db.workspaceMember.count({ where: { workspaceId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } })) >= perDay
  ) {
    throw new UserServiceError(`This workspace has reached its limit of ${perDay} new members per day. Try again later.`, 429);
  }
};

/**
 * Si una cuenta puede crear un espacio por su cuenta. Los admins de plataforma
 * no tienen estos limites: gestionan la plataforma.
 */
export const assertCanCreateWorkspace = async (user: { id: number; role: string }) => {
  if (user.role === "admin") return;
  if (!getSetting("allowWorkspaceCreation")) {
    throw new UserServiceError("Only platform administrators can create workspaces", 403);
  }
  const maxOwned = getSetting("maxOwnedWorkspaces");
  if (
    maxOwned > 0 &&
    (await prisma.workspaceMember.count({ where: { userId: user.id, role: "owner", workspace: { deletedAt: null } } })) >= maxOwned
  ) {
    throw new UserServiceError(`You have reached the limit of ${maxOwned} workspaces you can own`, 409);
  }
};

// --- Membresias (camino caliente: lo consulta cada peticion con JWT) ---

/**
 * Cache de membresias por `userId:workspaceId`. El panel consulta varias rutas
 * cada minuto y cada una comprobaria la membresia en base de datos; con esta
 * cache se hace una vez cada 30 s. Se vacia entera en cuanto cambia cualquier
 * membresia en esta instancia; en las demas, el TTL acota el retraso.
 */
const MEMBERSHIP_TTL_MS = 30_000;
const membershipCache = new Map<string, { role: WorkspaceRole | null; expires: number }>();

export const invalidateMemberships = () => membershipCache.clear();

/** Quien administra la plataforma entera: la cuenta root y los demas admins. */
export const isPlatformAdmin = (user: { role: string }) => user.role === "admin";

const cachedRole = async (key: string, load: () => Promise<WorkspaceRole | null>) => {
  const cached = membershipCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.role;
  const role = await load();
  membershipCache.set(key, { role, expires: Date.now() + MEMBERSHIP_TTL_MS });
  return role;
};

/** Rol del usuario como miembro del espacio, o null si no lo es o el espacio esta borrado. */
export const getMembershipRole = (userId: number, workspaceId: number): Promise<WorkspaceRole | null> =>
  cachedRole(`${userId}:${workspaceId}`, async () => {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId, workspace: { deletedAt: null } },
      select: { role: true },
    });
    return member?.role ?? null;
  });

/**
 * Rol con el que la cuenta actua en el espacio, o null si no tiene acceso.
 * El admin de plataforma es dueño de cualquier espacio vivo, sea o no miembro;
 * el resto, lo que diga su membresia. Es la unica puerta que deben usar las
 * rutas: consultar la membresia a secas dejaria fuera al admin.
 */
export const getWorkspaceRole = (user: { id: number; role: string }, workspaceId: number): Promise<WorkspaceRole | null> => {
  if (!isPlatformAdmin(user)) return getMembershipRole(user.id, workspaceId);
  return cachedRole(`admin:${workspaceId}`, async () => {
    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null }, select: { id: true } });
    return workspace ? "owner" : null;
  });
};

/**
 * Espacio que se usa cuando la peticion no dice cual: el mas antiguo que
 * administra el usuario, o si no administra ninguno, el mas antiguo al que
 * pertenece. Asi un cliente que no conozca los espacios sigue funcionando.
 * Un admin sin membresias cae en el espacio mas antiguo de la plataforma.
 */
export const getFallbackWorkspace = async (user: { id: number; role: string }) => {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { deletedAt: null } },
    orderBy: [{ role: "asc" }, { workspaceId: "asc" }],
    select: { workspaceId: true, role: true },
  });
  if (member) return { id: member.workspaceId, role: isPlatformAdmin(user) ? "owner" : member.role };
  if (!isPlatformAdmin(user)) return null;
  const first = await prisma.workspace.findFirst({ where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } });
  return first ? { id: first.id, role: "owner" as const } : null;
};

// --- Espacio por defecto (API_KEY heredada) ---

let defaultWorkspaceId: number | null = null;

export const setDefaultWorkspaceId = (id: number) => {
  defaultWorkspaceId = id;
};

/**
 * Espacio en el que escribe la API_KEY heredada de la variable de entorno: el
 * de la cuenta root, que es donde estaban todos los logs antes de que
 * existieran los espacios.
 */
export const getDefaultWorkspaceId = async (): Promise<number | null> => {
  if (defaultWorkspaceId !== null) return defaultWorkspaceId;
  const first = await prisma.workspace.findFirst({ where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } });
  if (first) defaultWorkspaceId = first.id;
  return defaultWorkspaceId;
};

// --- Espacios ---

const defaultNameFor = (email: string) => `Espacio de ${email.split("@")[0]}`.slice(0, WORKSPACE_NAME_MAX);

const workspaceSummaryFields = { id: true, name: true, createdAt: true, _count: { select: { members: true } } } as const;

/**
 * Espacios a los que la cuenta puede entrar, con su rol en cada uno. Para el
 * admin de plataforma son todos los espacios vivos, siempre como dueño.
 */
export const listUserWorkspaces = async (user: { id: number; role: string }): Promise<WorkspaceSummary[]> => {
  if (isPlatformAdmin(user)) {
    const workspaces = await prisma.workspace.findMany({
      where: { deletedAt: null },
      select: workspaceSummaryFields,
      orderBy: { id: "asc" },
    });
    return workspaces.map((w) => ({ id: w.id, name: w.name, role: "owner", memberCount: w._count.members, createdAt: w.createdAt }));
  }
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { deletedAt: null } },
    include: { workspace: { select: workspaceSummaryFields } },
    orderBy: { workspaceId: "asc" },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    role: m.role,
    memberCount: m.workspace._count.members,
    createdAt: m.workspace.createdAt,
  }));
};

/** Crea un espacio con `ownerId` como dueño. Acepta un cliente de transaccion. */
export const createWorkspace = async (
  ownerId: number,
  name: string | undefined,
  ownerEmail: string,
  db: Prisma.TransactionClient = prisma,
) => {
  const workspace = await db.workspace.create({
    data: {
      name: name?.trim() || defaultNameFor(ownerEmail),
      members: { create: { userId: ownerId, role: "owner" } },
    },
  });
  invalidateMemberships();
  return workspace;
};

export const renameWorkspace = async (workspaceId: number, name: string) => {
  const updated = await prisma.workspace.updateMany({
    where: { id: workspaceId, deletedAt: null },
    data: { name: name.trim() },
  });
  if (updated.count === 0) throw notFound();
  return prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
};

/**
 * Borrado logico: el espacio desaparece al instante para todos, sus claves
 * dejan de valer y sus reglas de alertar. Los logs los purga el planificador
 * por lotes, para no tener la peticion bloqueada borrando millones de filas.
 */
export const softDeleteWorkspace = async (workspaceId: number, db: Prisma.TransactionClient = prisma) => {
  const now = new Date();
  await db.workspace.update({ where: { id: workspaceId }, data: { deletedAt: now } });
  await db.apiKey.updateMany({ where: { workspaceId, revokedAt: null }, data: { revokedAt: now } });
  await db.alertRule.updateMany({ where: { workspaceId }, data: { enabled: false } });
  invalidateMemberships();
};

export const deleteWorkspace = async (workspaceId: number, confirmName: string) => {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  if (!workspace) throw notFound();
  if (workspace.name !== confirmName) {
    throw new UserServiceError("The confirmation does not match the workspace name", 400);
  }
  await prisma.$transaction((tx) => softDeleteWorkspace(workspaceId, tx));
};

/**
 * Purga los espacios borrados: primero sus logs, por lotes, y luego el resto.
 * La llama el planificador; si un espacio tiene tantos logs que no cabe en una
 * pasada, sigue en la siguiente.
 */
export const purgeDeletedWorkspaces = async (): Promise<number> => {
  // Un espacio sin miembros es inalcanzable. Por la API no puede quedar asi
  // (siempre tiene un dueño), pero si alguien borra cuentas directamente en la
  // base de datos, esto evita que sus datos y claves queden vivos para siempre.
  const orphans = await prisma.workspace.findMany({ where: { deletedAt: null, members: { none: {} } }, select: { id: true } });
  for (const { id } of orphans) await softDeleteWorkspace(id);

  const pending = await prisma.workspace.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
  let purged = 0;
  for (const { id } of pending) {
    await deleteLogsInBatches({ workspaceId: id });
    if ((await prisma.log.count({ where: { workspaceId: id } })) > 0) continue;
    await prisma.$transaction([
      prisma.alertRule.deleteMany({ where: { workspaceId: id } }),
      prisma.alertChannel.deleteMany({ where: { workspaceId: id } }),
      prisma.apiKey.deleteMany({ where: { workspaceId: id } }),
      prisma.workspace.delete({ where: { id } }),
    ]);
    purged += 1;
  }
  if (purged > 0) logger.info("Deleted workspaces purged", { purged });
  return purged;
};

// --- Miembros ---

export const listMembers = async (workspaceId: number): Promise<WorkspaceMemberView[]> => {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true, activatedAt: true, twoFactorEnabled: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return members.map((m) => ({
    userId: m.user.id,
    email: m.user.email,
    role: m.role,
    pending: m.user.activatedAt === null,
    twoFactorEnabled: m.user.twoFactorEnabled,
    joinedAt: m.createdAt,
  }));
};

const toMemberView = async (workspaceId: number, userId: number): Promise<WorkspaceMemberView> => {
  const members = await listMembers(workspaceId);
  const member = members.find((m) => m.userId === userId);
  if (!member) throw new UserServiceError("Member not found", 404);
  return member;
};

export type InviteResult = {
  member: WorkspaceMemberView;
  /** true si la cuenta no existia y se ha creado pendiente de activar. */
  created: boolean;
  /** true si el enlace de activacion salio por correo. */
  emailSent: boolean;
  /**
   * Ruta del enlace de activacion ("/reset-password?token=…&invite=1"). Solo
   * se devuelve si no se pudo enviar por correo: entonces quien invita lo
   * comparte por su cuenta.
   */
  invitePath?: string;
};

/** Hash imposible de satisfacer: bcrypt nunca produce una cadena asi. */
const UNUSABLE_PASSWORD_HASH = "!pending-invitation";

/**
 * Crea una cuenta pendiente de activar: existe (se puede anadir a espacios),
 * pero no puede entrar hasta elegir su contrasena con el enlace.
 */
export const createPendingAccount = (email: string, db: Prisma.TransactionClient = prisma) =>
  db.user.create({ data: { email, passwordHash: UNUSABLE_PASSWORD_HASH, activatedAt: null } });

/** Envia (o, si no hay correo, devuelve) el enlace para que una cuenta pendiente se active. */
export const deliverInvitation = async (
  user: { id: number; email: string },
  workspaceName: string,
  locale: "es" | "en",
): Promise<Pick<InviteResult, "emailSent" | "invitePath">> => {
  const { emailSent, path } = await sendInvitation(user, workspaceName, locale);
  return emailSent ? { emailSent } : { emailSent, invitePath: path };
};

/**
 * Anade a alguien a un espacio por su correo. Si ya tiene cuenta entra al
 * momento; si no, se crea pendiente y recibe un enlace para elegir contrasena.
 */
export const addMember = async (
  workspaceId: number,
  email: string,
  role: WorkspaceRole,
  locale: "es" | "en" = "es",
): Promise<InviteResult> => {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  if (!workspace) throw notFound();

  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } });

  if (existing) {
    const already = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existing.id } },
    });
    if (already) throw new UserServiceError("This person is already a member of the workspace", 409);
    await assertCanAddMember(workspaceId);

    await prisma.workspaceMember.create({ data: { workspaceId, userId: existing.id, role } });
    invalidateMemberships();

    // Una cuenta que sigue pendiente necesita su enlace; una activa solo un aviso.
    if (existing.activatedAt === null) {
      const delivery = await deliverInvitation(existing, workspace.name, locale);
      return { member: await toMemberView(workspaceId, existing.id), created: false, ...delivery };
    }
    const emailSent = await sendMembershipNotice(existing.email, workspace.name, locale);
    return { member: await toMemberView(workspaceId, existing.id), created: false, emailSent };
  }

  await assertCanAddMember(workspaceId);
  const user = await prisma.$transaction(async (tx) => {
    const created = await createPendingAccount(normalized, tx);
    await tx.workspaceMember.create({ data: { workspaceId, userId: created.id, role } });
    return created;
  });
  invalidateMemberships();

  const delivery = await deliverInvitation(user, workspace.name, locale);
  return { member: await toMemberView(workspaceId, user.id), created: true, ...delivery };
};

/** Genera un enlace nuevo para un miembro que aun no ha activado su cuenta. */
export const resendInvitation = async (workspaceId: number, userId: number, locale: "es" | "en" = "es") => {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { user: true, workspace: true },
  });
  if (!member || member.workspace.deletedAt) throw new UserServiceError("Member not found", 404);
  if (member.user.activatedAt !== null) throw new UserServiceError("This account is already active", 409);
  return deliverInvitation(member.user, member.workspace.name, locale);
};

const countOwners = (workspaceId: number, db: Prisma.TransactionClient = prisma) =>
  db.workspaceMember.count({ where: { workspaceId, role: "owner" } });

export const updateMemberRole = async (workspaceId: number, userId: number, role: WorkspaceRole) => {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new UserServiceError("Member not found", 404);

  if (member.role === "owner" && role !== "owner" && (await countOwners(workspaceId)) <= 1) {
    throw new UserServiceError("A workspace needs at least one owner", 409);
  }
  await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role } });
  invalidateMemberships();
  return toMemberView(workspaceId, userId);
};

/**
 * Quita a alguien del espacio (o sale uno mismo). Una cuenta invitada que no
 * llego a activarse y ya no esta en ningun espacio se borra: no le queda nada
 * a lo que entrar.
 */
export const removeMember = async (workspaceId: number, userId: number) => {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { user: { select: { activatedAt: true } } },
  });
  if (!member) throw new UserServiceError("Member not found", 404);

  if (member.role === "owner" && (await countOwners(workspaceId)) <= 1) {
    throw new UserServiceError("A workspace needs at least one owner", 409);
  }

  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
  invalidateMemberships();

  if (member.user.activatedAt === null && (await prisma.workspaceMember.count({ where: { userId } })) === 0) {
    await prisma.user.delete({ where: { id: userId } });
  }
};

/**
 * Prepara el borrado de una cuenta. Si es la unica duena de un espacio en el
 * que hay mas gente, se bloquea: borrarla dejaria a esas personas sin nadie
 * que lo administre. Los espacios en los que esta sola se borran con ella.
 */
export const releaseWorkspacesOf = async (userId: number) => {
  const owned = await prisma.workspaceMember.findMany({
    where: { userId, role: "owner", workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true } } },
  });

  const orphaned: number[] = [];
  for (const membership of owned) {
    const others = await prisma.workspaceMember.findMany({
      where: { workspaceId: membership.workspaceId, userId: { not: userId } },
      select: { role: true },
    });
    if (others.length === 0) {
      orphaned.push(membership.workspaceId);
    } else if (!others.some((other) => other.role === "owner")) {
      throw new UserServiceError(
        `This account is the only owner of the workspace "${membership.workspace.name}". Make another member owner first.`,
        409,
      );
    }
  }

  return async (db: Prisma.TransactionClient) => {
    for (const workspaceId of orphaned) await softDeleteWorkspace(workspaceId, db);
  };
};
