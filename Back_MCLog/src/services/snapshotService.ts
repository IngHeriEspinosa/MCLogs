import { randomBytes } from "crypto";
import { Prisma, SnapshotVisibility } from "@prisma/client";
import { prisma } from "../config/prisma";
import logger from "../config/logger";
import { buildWhere, getLogStats, LogFilters } from "./logService";
import { getErrorGroups, getLevelTimeline } from "./analysisService";
import { getMembershipRole } from "./workspaceService";
import { getSetting } from "./settingsService";
import { createRedactor } from "../utils/redact";

/**
 * Snapshots: copias congeladas de la vista de logs para compartirlas con un
 * enlace. Se guardan los datos, no la consulta: lo que ve quien abre el enlace
 * es lo que habia al crearlo, aunque despues lleguen logs o actue la retencion.
 */

export const SNAPSHOT_EXPIRY_DAYS = [1, 7, 30] as const;
export const SNAPSHOT_TITLE_MAX = 160;
export const SNAPSHOT_SORT_FIELDS = ["timestamp", "level", "application", "host", "environment"] as const;

/** La serie por hora cubre como mucho 31 dias, como la del panel. */
const MAX_TIMELINE_MS = 31 * 24 * 3600 * 1000;
/** Fallos que se guardan con su detalle; el recuento de distintos llega hasta DISTINCT_CAP. */
const TOP_ERRORS = 5;
const DISTINCT_CAP = 100;
/** Filtros de texto libre: los que se enmascaran en un snapshot publico. Los identificadores no. */
const FREE_TEXT_FILTERS = new Set(["search", "message", "host"]);

export class SnapshotError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Filtros de la vista, tal como los manda el panel. */
export type SnapshotFilters = {
  application?: string;
  level?: string;
  environment?: string;
  search?: string;
  fingerprint?: string;
  service?: string;
  host?: string;
  traceId?: string;
  message?: string;
  errorName?: string;
  errorCode?: string;
  from?: Date;
  to?: Date;
  sortField?: (typeof SNAPSHOT_SORT_FIELDS)[number];
  sortDir?: "asc" | "desc";
};

type CreateSnapshotInput = {
  workspaceId: number;
  userId: number;
  role: "owner" | "member";
  title: string;
  visibility: SnapshotVisibility;
  /** null = no caduca. */
  expiresInDays: number | null;
  filters: SnapshotFilters;
};

/** Lo que se lista y se devuelve al crear: sin los datos, que pueden pesar megas. */
const METADATA = {
  id: true,
  token: true,
  title: true,
  visibility: true,
  redacted: true,
  filters: true,
  totalMatched: true,
  createdAt: true,
  expiresAt: true,
  viewCount: true,
  lastViewedAt: true,
  createdById: true,
  createdBy: { select: { email: true } },
} satisfies Prisma.SnapshotSelect;

/** Campos de cada log que se copian. El workspaceId no: no le dice nada a quien lo ve. */
const LOG_FIELDS = {
  id: true,
  timestamp: true,
  application: true,
  service: true,
  host: true,
  level: true,
  environment: true,
  message: true,
  traceId: true,
  spanId: true,
  metadata: true,
  errorName: true,
  errorCode: true,
  errorStack: true,
  fingerprint: true,
} satisfies Prisma.LogSelect;

const newToken = () => randomBytes(32).toString("base64url");

const toMetadata = ({ createdBy, ...snapshot }: Prisma.SnapshotGetPayload<{ select: typeof METADATA }>) => ({
  ...snapshot,
  createdByEmail: createdBy?.email ?? null,
});

/**
 * Captura la vista y la guarda.
 *
 * El resumen responde al rango, la aplicacion y el entorno, igual que el de la
 * pantalla de logs; la tabla aplica ademas el resto de filtros. Asi el snapshot
 * enseña lo mismo que se estaba viendo al pulsar "Compartir".
 */
export const createSnapshot = async (input: CreateSnapshotInput) => {
  const { workspaceId, filters } = input;

  if (input.visibility === "public") {
    if (!getSetting("publicSnapshotsEnabled")) throw new SnapshotError("Public snapshots are disabled", 403);
    if (input.role !== "owner") throw new SnapshotError("Only the workspace owner can create public snapshots", 403);
  }

  // El momento de la captura cierra los rangos abiertos ("ultimas 24 h").
  const to = filters.to ?? new Date();
  const from = filters.from;
  if (from && from > to) throw new SnapshotError("from must be before to", 400);

  const tableFilters: LogFilters = {
    workspaceId,
    application: filters.application,
    level: filters.level,
    environment: filters.environment,
    search: filters.search,
    fingerprint: filters.fingerprint,
    service: filters.service,
    host: filters.host,
    traceId: filters.traceId,
    message: filters.message,
    errorName: filters.errorName,
    errorCode: filters.errorCode,
    from,
    to,
  };
  const scopeFilters: LogFilters = { workspaceId, application: filters.application, environment: filters.environment, from, to };
  const timelineFrom = new Date(Math.max(from?.getTime() ?? 0, to.getTime() - MAX_TIMELINE_MS));
  const sortField = filters.sortField ?? "timestamp";
  const sortDir = filters.sortDir ?? "desc";
  const scopeWhere = buildWhere(scopeFilters);

  const [rows, totalMatched, stats, timeline, groups, apps, appsWithErrors] = await Promise.all([
    prisma.log.findMany({
      where: buildWhere(tableFilters),
      orderBy: [{ [sortField]: sortDir } as Prisma.LogOrderByWithRelationInput, { id: sortDir }],
      take: getSetting("maxSnapshotRows"),
      select: LOG_FIELDS,
    }),
    prisma.log.count({ where: buildWhere(tableFilters) }),
    getLogStats(scopeFilters),
    getLevelTimeline(scopeFilters, timelineFrom, to),
    getErrorGroups({ ...scopeFilters, level: "error" }, DISTINCT_CAP),
    prisma.log.groupBy({ by: ["application"], where: scopeWhere }),
    prisma.log.groupBy({ by: ["application"], where: { AND: [scopeWhere, { level: "error" }] } }),
  ]);

  const byLevel = Object.fromEntries(stats.byLevel.map((row) => [row.level, row.count]));
  let summary = {
    total: stats.total,
    byLevel: { error: byLevel.error ?? 0, warn: byLevel.warn ?? 0, info: byLevel.info ?? 0, debug: byLevel.debug ?? 0 },
    timeline,
    timelineFrom,
    byApplication: stats.byApplication,
    byEnvironment: stats.byEnvironment,
    applications: apps.length,
    applicationsWithErrors: appsWithErrors.length,
    distinctErrors: groups.length,
    distinctErrorsCapped: groups.length >= DISTINCT_CAP,
    topErrors: groups.slice(0, TOP_ERRORS).map((group) => ({
      fingerprint: group.fingerprint,
      application: group.application,
      errorName: group.errorName,
      sampleMessage: group.sampleMessage,
      count: group.count,
      lastSeen: group.lastSeen,
    })),
  };
  let logs: unknown = rows;

  // Lo publico sale siempre enmascarado. Los identificadores (id, traceId,
  // huella) se quedan: son los que permiten seguir investigando.
  const redacted = input.visibility === "public";
  if (redacted) {
    const redactor = createRedactor();
    logs = rows.map((row) => ({
      ...row,
      message: redactor.text(row.message),
      host: row.host && redactor.text(row.host),
      errorStack: row.errorStack && redactor.text(row.errorStack),
      metadata: row.metadata === null ? null : redactor.value(row.metadata),
    }));
    summary = {
      ...summary,
      topErrors: summary.topErrors.map((group) => ({ ...group, sampleMessage: redactor.text(group.sampleMessage) })),
    };
  }

  // Los filtros tambien se enseñan, y una busqueda puede ser un correo o un token.
  const redactFilter = createRedactor();
  const savedFilters = {
    ...Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, redacted && FREE_TEXT_FILTERS.has(key) ? redactFilter.text(String(value)) : value]),
    ),
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
    sortField,
    sortDir,
  };

  const created = await prisma.snapshot.create({
    data: {
      workspaceId,
      token: newToken(),
      title: input.title,
      visibility: input.visibility,
      redacted,
      filters: savedFilters as Prisma.InputJsonValue,
      summary: JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue,
      logs: JSON.parse(JSON.stringify(logs)) as Prisma.InputJsonValue,
      totalMatched,
      createdById: input.userId,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000) : null,
    },
    select: METADATA,
  });
  return toMetadata(created);
};

/** Los del espacio, recientes primero. Solo metadatos. */
export const listSnapshots = async (workspaceId: number) => {
  const rows = await prisma.snapshot.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: METADATA,
  });
  return rows.map(toMetadata);
};

/** Lo borra quien lo creo o el dueño del espacio. Devuelve null si no es del espacio. */
export const deleteSnapshot = async (id: number, workspaceId: number, user: { id: number; role: "owner" | "member" }) => {
  const snapshot = await prisma.snapshot.findFirst({ where: { id, workspaceId }, select: { id: true, createdById: true } });
  if (!snapshot) return null;
  if (user.role !== "owner" && snapshot.createdById !== user.id) {
    throw new SnapshotError("Only its author or the workspace owner can delete this snapshot", 403);
  }
  await prisma.snapshot.delete({ where: { id } });
  return snapshot;
};

const loadByToken = (token: string) =>
  prisma.snapshot.findUnique({
    where: { token },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      visibility: true,
      redacted: true,
      filters: true,
      summary: true,
      logs: true,
      totalMatched: true,
      createdAt: true,
      expiresAt: true,
      workspace: { select: { name: true, deletedAt: true } },
    },
  });

type SnapshotRecord = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/**
 * El snapshot de un enlace, o null si no existe, caduco o no se puede ver.
 *
 * Todos los "no" son el mismo null (y un 404 en la ruta): distinguir "existe
 * pero es de equipo" confirmaria que el enlace es bueno a quien no deberia
 * saberlo. La excepcion es `requiresAuth`, para ofrecer iniciar sesion a quien
 * llega sin ella con un enlace de equipo: sin sesion no se revela nada mas.
 */
export const getSnapshotByToken = async (
  token: string,
  viewerId: number | undefined,
): Promise<{ snapshot: SnapshotRecord } | { requiresAuth: true } | null> => {
  const snapshot = await loadByToken(token);
  if (!snapshot || snapshot.workspace.deletedAt) return null;
  if (snapshot.expiresAt && snapshot.expiresAt <= new Date()) return null;
  // Apagar los publicos en la configuracion corta tambien los ya creados: es el
  // interruptor para dejar de exponer datos de golpe, sin ir borrando uno a uno.
  if (snapshot.visibility === "public" && !getSetting("publicSnapshotsEnabled")) return null;

  if (snapshot.visibility === "workspace") {
    if (viewerId === undefined) return { requiresAuth: true };
    if (!(await getMembershipRole(viewerId, snapshot.workspaceId))) return null;
  }

  // Contar la visita no debe impedir verlo.
  void prisma.snapshot
    .update({ where: { id: snapshot.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
    .catch((error) => logger.warn("Could not record snapshot view", { id: snapshot.id, error: String(error) }));

  return { snapshot };
};

/** Borra los caducados. La llama el planificador. */
export const purgeExpiredSnapshots = async (): Promise<number> => {
  const { count } = await prisma.snapshot.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  if (count > 0) logger.info("Expired snapshots removed", { deleted: count });
  return count;
};
