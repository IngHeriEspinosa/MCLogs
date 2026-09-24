import { randomBytes } from "crypto";
import { Prisma, SnapshotKind, SnapshotVisibility } from "@prisma/client";
import { prisma } from "../config/prisma";
import logger from "../config/logger";
import { buildWhere, getLogStats, LogFilters } from "./logService";
import { getErrorGroups, getLevelTimeline, MAX_TRACE_LOGS } from "./analysisService";
import { getMembershipRole } from "./workspaceService";
import { getSetting } from "./settingsService";
import { createRedactor } from "../utils/redact";

/**
 * Snapshots: copias congeladas de una pantalla (Logs, Errores o una Traza)
 * para compartirlas con un enlace. Se guardan los datos, no la consulta: lo
 * que ve quien abre el enlace es lo que habia al crearlo, aunque despues
 * lleguen logs o actue la retencion.
 */

export const SNAPSHOT_EXPIRY_DAYS = [1, 7, 30] as const;
export const SNAPSHOT_KINDS = ["logs", "errors", "trace"] as const;
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
  kind: SnapshotKind;
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
  kind: true,
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

type LogRow = Prisma.LogGetPayload<{ select: typeof LOG_FIELDS }>;

/** Lo que produce capturar una pantalla, antes de enmascarar y guardar. */
type Capture = {
  summary: Record<string, unknown>;
  logs: LogRow[];
  totalMatched: number;
  /** Filtros que se guardan y se enseñan: solo los que usa ese tipo. */
  filters: Record<string, unknown>;
};

const definedEntries = (source: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ""));

/**
 * Logs: el resumen responde al rango, la aplicacion y el entorno, igual que el
 * de la pantalla; la tabla aplica ademas el resto de filtros. Asi el snapshot
 * enseña lo mismo que se estaba viendo al pulsar "Compartir".
 */
const captureLogs = async (workspaceId: number, filters: SnapshotFilters, to: Date): Promise<Capture> => {
  const from = filters.from;
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
  const tableWhere = buildWhere(tableFilters);

  const [rows, totalMatched, stats, timeline, groups, apps, appsWithErrors] = await Promise.all([
    prisma.log.findMany({
      where: tableWhere,
      orderBy: [{ [sortField]: sortDir } as Prisma.LogOrderByWithRelationInput, { id: sortDir }],
      take: getSetting("maxSnapshotRows"),
      select: LOG_FIELDS,
    }),
    prisma.log.count({ where: tableWhere }),
    getLogStats(scopeFilters),
    getLevelTimeline(scopeFilters, timelineFrom, to),
    getErrorGroups({ ...scopeFilters, level: "error" }, DISTINCT_CAP),
    prisma.log.groupBy({ by: ["application"], where: scopeWhere }),
    prisma.log.groupBy({ by: ["application"], where: { AND: [scopeWhere, { level: "error" }] } }),
  ]);

  const byLevel = Object.fromEntries(stats.byLevel.map((row) => [row.level, row.count]));
  return {
    summary: {
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
    },
    logs: rows,
    totalMatched,
    filters: {
      ...definedEntries({ ...filters, from: undefined, to: undefined }),
      from: from?.toISOString() ?? null,
      to: to.toISOString(),
      sortField,
      sortDir,
    },
  };
};

/**
 * Errores: los grupos del rango (hasta DISTINCT_CAP, como la pantalla) y el
 * ejemplo mas reciente de cada uno, para poder leer su detalle sin ir a los
 * datos en vivo.
 */
const captureErrors = async (workspaceId: number, filters: SnapshotFilters, to: Date): Promise<Capture> => {
  const level = filters.level === "warn" ? "warn" : "error";
  const scope: LogFilters = { workspaceId, application: filters.application, environment: filters.environment, from: filters.from, to };
  const groups = await getErrorGroups({ ...scope, level }, DISTINCT_CAP);
  const sampleIds = groups.slice(0, getSetting("maxSnapshotRows")).map((group) => group.lastLogId);
  const samples = sampleIds.length
    ? await prisma.log.findMany({ where: { workspaceId, id: { in: sampleIds } }, select: LOG_FIELDS })
    : [];
  const occurrences = groups.reduce((sum, group) => sum + group.count, 0);
  return {
    summary: { level, groups, capped: groups.length >= DISTINCT_CAP, occurrences },
    logs: samples,
    totalMatched: occurrences,
    filters: {
      ...definedEntries({ application: filters.application, environment: filters.environment }),
      level,
      from: filters.from?.toISOString() ?? null,
      to: to.toISOString(),
    },
  };
};

/** Traza: todos sus logs en orden (hasta el tope) y los totales de la operacion entera. */
const captureTrace = async (workspaceId: number, filters: SnapshotFilters): Promise<Capture> => {
  const traceId = filters.traceId;
  if (!traceId) throw new SnapshotError("traceId is required for a trace snapshot", 400);
  const where = buildWhere({ workspaceId, traceId });
  const [rows, total, errors, span, apps] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: Math.min(getSetting("maxSnapshotRows"), MAX_TRACE_LOGS),
      select: LOG_FIELDS,
    }),
    prisma.log.count({ where }),
    prisma.log.count({ where: { AND: [where, { level: "error" }] } }),
    prisma.log.aggregate({ where, _min: { timestamp: true }, _max: { timestamp: true } }),
    prisma.log.groupBy({ by: ["application"], where }),
  ]);
  if (total === 0) throw new SnapshotError("Trace not found", 404);
  const first = span._min.timestamp?.getTime() ?? 0;
  const last = span._max.timestamp?.getTime() ?? 0;
  return {
    summary: { traceId, total, errors, applications: apps.map((row) => row.application), durationMs: last - first },
    logs: rows,
    totalMatched: total,
    filters: { traceId },
  };
};

/**
 * Captura una pantalla y la guarda.
 *
 * Los publicos salen siempre enmascarados, en el servidor: mensajes, hosts,
 * stacks, metadata, mensajes de ejemplo y filtros de texto libre. Los
 * identificadores (id, traceId, huella) se quedan: son los que permiten seguir
 * investigando.
 */
export const createSnapshot = async (input: CreateSnapshotInput) => {
  const { workspaceId, filters, kind } = input;

  if (input.visibility === "public") {
    if (!getSetting("publicSnapshotsEnabled")) throw new SnapshotError("Public snapshots are disabled", 403);
    if (input.role !== "owner") throw new SnapshotError("Only the workspace owner can create public snapshots", 403);
  }

  // Cada snapshot es una copia de hasta maxSnapshotRows logs: sin tope, un
  // miembro podria llenar la base de datos pulsando "Compartir". Los caducados
  // no cuentan, aunque la purga aun no los haya borrado.
  const cap = getSetting("maxSnapshotsPerWorkspace");
  if (cap > 0) {
    const active = await prisma.snapshot.count({
      where: { workspaceId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    if (active >= cap) throw new SnapshotError("Snapshot limit reached for this workspace", 409);
  }

  // El momento de la captura cierra los rangos abiertos ("ultimas 24 h").
  const to = filters.to ?? new Date();
  if (filters.from && filters.from > to) throw new SnapshotError("from must be before to", 400);

  const capture =
    kind === "errors"
      ? await captureErrors(workspaceId, filters, to)
      : kind === "trace"
        ? await captureTrace(workspaceId, filters)
        : await captureLogs(workspaceId, filters, to);

  const redacted = input.visibility === "public";
  let { summary, logs, filters: savedFilters } = capture as { summary: Record<string, unknown>; logs: unknown[]; filters: Record<string, unknown> };
  if (redacted) {
    const redactor = createRedactor();
    const text = (value: unknown) => (typeof value === "string" ? redactor.text(value) : value);
    logs = capture.logs.map((row) => ({
      ...row,
      message: redactor.text(row.message),
      host: row.host && redactor.text(row.host),
      errorStack: row.errorStack && redactor.text(row.errorStack),
      metadata: row.metadata === null ? null : redactor.value(row.metadata),
    }));
    const withSample = (list: unknown) =>
      Array.isArray(list) ? list.map((group) => ({ ...group, sampleMessage: text(group.sampleMessage) })) : list;
    summary = { ...summary, topErrors: withSample(summary.topErrors), groups: withSample(summary.groups) };
    // Los filtros tambien se enseñan, y una busqueda puede ser un correo o un token.
    savedFilters = Object.fromEntries(
      Object.entries(savedFilters).map(([key, value]) => [key, FREE_TEXT_FILTERS.has(key) ? text(value) : value]),
    );
  }

  const created = await prisma.snapshot.create({
    data: {
      workspaceId,
      token: newToken(),
      title: input.title,
      kind,
      visibility: input.visibility,
      redacted,
      filters: savedFilters as Prisma.InputJsonValue,
      // Ida y vuelta por JSON: Prisma no acepta Date dentro de un campo Json.
      summary: JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue,
      logs: JSON.parse(JSON.stringify(logs)) as Prisma.InputJsonValue,
      totalMatched: capture.totalMatched,
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

/** Lo necesario para decidir si se puede ver, sin los datos, que pueden pesar megas. */
const loadAccessByToken = (token: string) =>
  prisma.snapshot.findUnique({
    where: { token },
    select: {
      id: true,
      workspaceId: true,
      visibility: true,
      expiresAt: true,
      workspace: { select: { name: true, deletedAt: true } },
    },
  });

const loadData = (id: number) =>
  prisma.snapshot.findUnique({
    where: { id },
    select: {
      title: true,
      kind: true,
      visibility: true,
      redacted: true,
      filters: true,
      summary: true,
      logs: true,
      totalMatched: true,
      createdAt: true,
      expiresAt: true,
    },
  });

/** Lo que se sirve por el enlace: nunca el id interno ni el del espacio. */
type SnapshotView = NonNullable<Awaited<ReturnType<typeof loadData>>> & { workspaceName: string | null };

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
): Promise<{ snapshot: SnapshotView } | { requiresAuth: true } | null> => {
  // Primero el acceso y despues los datos: un enlace de equipo abierto sin
  // sesion, o por quien no es miembro, no carga megas de logs para nada.
  const snapshot = await loadAccessByToken(token);
  if (!snapshot || snapshot.workspace.deletedAt) return null;
  if (snapshot.expiresAt && snapshot.expiresAt <= new Date()) return null;
  // Apagar los publicos en la configuracion corta tambien los ya creados: es el
  // interruptor para dejar de exponer datos de golpe, sin ir borrando uno a uno.
  if (snapshot.visibility === "public" && !getSetting("publicSnapshotsEnabled")) return null;

  if (snapshot.visibility === "workspace") {
    if (viewerId === undefined) return { requiresAuth: true };
    if (!(await getMembershipRole(viewerId, snapshot.workspaceId))) return null;
  }

  const data = await loadData(snapshot.id);
  // Borrado entre las dos consultas.
  if (!data) return null;

  // Contar la visita no debe impedir verlo.
  void prisma.snapshot
    .update({ where: { id: snapshot.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
    .catch((error) => logger.warn("Could not record snapshot view", { id: snapshot.id, error: String(error) }));

  return {
    snapshot: {
      ...data,
      // El nombre del espacio solo lo ve quien ya es miembro: en uno publico, nadie.
      workspaceName: snapshot.visibility === "workspace" ? snapshot.workspace.name : null,
    },
  };
};

/** Totales para la vista previa, segun el tipo. Salen del resumen guardado: no se cargan los logs. */
const previewStats = (kind: SnapshotKind, summary: Prisma.JsonValue, totalMatched: number) => {
  const data = (summary ?? {}) as Record<string, any>;
  if (kind === "errors") return { groups: Array.isArray(data.groups) ? data.groups.length : 0, occurrences: totalMatched };
  if (kind === "trace") {
    return {
      records: totalMatched,
      errors: data.errors ?? 0,
      applications: Array.isArray(data.applications) ? data.applications.length : 0,
      durationMs: data.durationMs ?? 0,
    };
  }
  return { records: data.total ?? totalMatched, errors: data.byLevel?.error ?? 0, warnings: data.byLevel?.warn ?? 0 };
};

/**
 * Lo justo para la vista previa de un enlace (Slack, WhatsApp, Teams…): titulo,
 * tipo, fecha y unos totales. Solo de los publicos vigentes: el robot que pide
 * la vista previa no tiene sesion, y de uno de equipo no debe salir ni el
 * titulo. No cuenta como visita.
 */
export const getSnapshotPreview = async (token: string) => {
  if (!getSetting("publicSnapshotsEnabled")) return null;
  const snapshot = await prisma.snapshot.findUnique({
    where: { token },
    select: {
      kind: true,
      title: true,
      visibility: true,
      redacted: true,
      createdAt: true,
      expiresAt: true,
      totalMatched: true,
      summary: true,
      workspace: { select: { deletedAt: true } },
    },
  });
  if (!snapshot || snapshot.visibility !== "public" || snapshot.workspace.deletedAt) return null;
  if (snapshot.expiresAt && snapshot.expiresAt <= new Date()) return null;
  return {
    kind: snapshot.kind,
    title: snapshot.title,
    redacted: snapshot.redacted,
    createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
    stats: previewStats(snapshot.kind, snapshot.summary, snapshot.totalMatched),
  };
};

/** Borra los caducados. La llama el planificador. */
export const purgeExpiredSnapshots = async (): Promise<number> => {
  const { count } = await prisma.snapshot.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  if (count > 0) logger.info("Expired snapshots removed", { deleted: count });
  return count;
};
