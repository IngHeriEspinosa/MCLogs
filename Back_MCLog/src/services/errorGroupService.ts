import { ErrorGroupStatus, LogLevel, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { CreateLogInput } from "./logService";

/**
 * Ciclo de vida de los fallos: la tabla ErrorGroup, una fila por huella y
 * espacio. La mantiene la ingesta y la cambia el dueno del espacio (resolver,
 * ignorar). Las cuentas de una ventana no salen de aqui sino de Log; aqui esta
 * lo que Log no puede responder: la primera vez de verdad (mas alla de la
 * retencion), el estado y las regresiones.
 */

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

type GroupDelta = {
  workspaceId: number;
  fingerprint: string;
  application: string;
  service: string | null;
  errorName: string | null;
  errorCode: string | null;
  level: LogLevel;
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  firstRelease: string | null;
  lastRelease: string | null;
};

/** Junta por huella lo que trae un lote: un solo upsert por fallo, no uno por log. */
export const aggregateGroups = (inputs: CreateLogInput[], now: Date): GroupDelta[] => {
  const byKey = new Map<string, GroupDelta>();
  for (const input of inputs) {
    if (!input.fingerprint) continue;
    const at = input.timestamp ?? now;
    const key = `${input.workspaceId}|${input.fingerprint}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        workspaceId: input.workspaceId,
        fingerprint: input.fingerprint,
        application: input.application,
        service: input.service ?? null,
        errorName: input.errorName ?? null,
        errorCode: input.errorCode ?? null,
        level: input.level,
        firstSeen: at,
        lastSeen: at,
        count: 1,
        firstRelease: input.release ?? null,
        lastRelease: input.release ?? null,
      });
      continue;
    }
    current.count += 1;
    if (LEVEL_RANK[input.level] > LEVEL_RANK[current.level]) current.level = input.level;
    if (at < current.firstSeen) {
      current.firstSeen = at;
      current.firstRelease = input.release ?? current.firstRelease;
    }
    if (at >= current.lastSeen) {
      current.lastSeen = at;
      current.lastRelease = input.release ?? current.lastRelease;
    }
  }
  return [...byKey.values()];
};

/**
 * Upsert de los grupos de un lote, para ir en la misma transaccion que el
 * INSERT de los logs. Al chocar con un grupo existente:
 *
 * - amplia primera y ultima vez y suma las ocurrencias;
 * - un grupo resuelto que recibe una ocurrencia posterior a su resolucion
 *   vuelve a activo y cuenta una regresion (una ocurrencia atrasada, enviada
 *   tarde, no lo reabre);
 * - un grupo ignorado hasta una fecha ya pasada vuelve a activo.
 *
 * `now` va como parametro y no como NOW(): las columnas no tienen zona
 * horaria, y NOW() dependeria de la de la sesion.
 */
export const upsertGroupsSql = (deltas: GroupDelta[], now: Date): Prisma.Sql | null => {
  if (deltas.length === 0) return null;
  const rows = deltas.map(
    (delta) => Prisma.sql`(
      ${delta.workspaceId}, ${delta.fingerprint}, ${delta.application}, ${delta.service}, ${delta.errorName},
      ${delta.errorCode}, ${delta.level}::"LogLevel", ${delta.firstSeen}, ${delta.lastSeen}, ${delta.count},
      ${delta.firstRelease}, ${delta.lastRelease}
    )`,
  );
  return Prisma.sql`
    INSERT INTO "ErrorGroup" (
      "workspaceId", "fingerprint", "application", "service", "errorName", "errorCode", "level",
      "firstSeen", "lastSeen", "totalCount", "firstRelease", "lastRelease"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("workspaceId", "fingerprint") DO UPDATE SET
      "firstSeen" = LEAST("ErrorGroup"."firstSeen", EXCLUDED."firstSeen"),
      "firstRelease" = CASE WHEN EXCLUDED."firstSeen" < "ErrorGroup"."firstSeen" THEN COALESCE(EXCLUDED."firstRelease", "ErrorGroup"."firstRelease") ELSE "ErrorGroup"."firstRelease" END,
      "lastSeen" = GREATEST("ErrorGroup"."lastSeen", EXCLUDED."lastSeen"),
      "lastRelease" = CASE WHEN EXCLUDED."lastSeen" >= "ErrorGroup"."lastSeen" THEN COALESCE(EXCLUDED."lastRelease", "ErrorGroup"."lastRelease") ELSE "ErrorGroup"."lastRelease" END,
      "totalCount" = "ErrorGroup"."totalCount" + EXCLUDED."totalCount",
      "level" = GREATEST("ErrorGroup"."level", EXCLUDED."level"),
      "regressionCount" = "ErrorGroup"."regressionCount" + CASE
        WHEN "ErrorGroup"."status" = 'resolved' AND EXCLUDED."lastSeen" > "ErrorGroup"."resolvedAt" THEN 1 ELSE 0 END,
      "lastRegressedAt" = CASE
        WHEN "ErrorGroup"."status" = 'resolved' AND EXCLUDED."lastSeen" > "ErrorGroup"."resolvedAt" THEN ${now}
        ELSE "ErrorGroup"."lastRegressedAt" END,
      "ignoredUntil" = CASE
        WHEN "ErrorGroup"."status" = 'ignored' AND "ErrorGroup"."ignoredUntil" < ${now} THEN NULL
        ELSE "ErrorGroup"."ignoredUntil" END,
      "status" = CASE
        WHEN "ErrorGroup"."status" = 'resolved' AND EXCLUDED."lastSeen" > "ErrorGroup"."resolvedAt" THEN 'active'::"ErrorGroupStatus"
        WHEN "ErrorGroup"."status" = 'ignored' AND "ErrorGroup"."ignoredUntil" < ${now} THEN 'active'::"ErrorGroupStatus"
        ELSE "ErrorGroup"."status" END
  `;
};

export type GroupLifecycle = {
  fingerprint: string;
  status: ErrorGroupStatus;
  /** Primera vez de verdad, no solo dentro de la ventana. */
  firstSeenEver: Date;
  totalCount: number;
  resolvedAt: Date | null;
  ignoredUntil: Date | null;
  regressionCount: number;
  lastRegressedAt: Date | null;
  firstRelease: string | null;
  lastRelease: string | null;
  note: string | null;
};

/** El ciclo de vida de unas huellas, por huella. */
export const lifecycleOf = async (workspaceId: number, fingerprints: string[]) => {
  if (fingerprints.length === 0) return new Map<string, GroupLifecycle>();
  const rows = await prisma.errorGroup.findMany({
    where: { workspaceId, fingerprint: { in: fingerprints } },
    select: {
      fingerprint: true,
      status: true,
      firstSeen: true,
      totalCount: true,
      resolvedAt: true,
      ignoredUntil: true,
      regressionCount: true,
      lastRegressedAt: true,
      firstRelease: true,
      lastRelease: true,
      note: true,
    },
  });
  return new Map(rows.map(({ firstSeen, ...row }) => [row.fingerprint, { ...row, firstSeenEver: firstSeen }]));
};

/** Estados por los que se filtra la vista de errores. `regressed` = activo tras volver a aparecer. */
export const GROUP_STATUS_FILTERS = ["active", "resolved", "ignored", "regressed"] as const;
export type GroupStatusFilter = (typeof GROUP_STATUS_FILTERS)[number];

/** Condicion SQL (sobre ErrorGroup) de un filtro de estado. */
export const statusConditionSql = (filter: GroupStatusFilter): Prisma.Sql => {
  if (filter === "regressed") return Prisma.sql`"status" = 'active' AND "lastRegressedAt" IS NOT NULL`;
  return Prisma.sql`"status" = ${filter}::"ErrorGroupStatus"`;
};

export class ErrorGroupError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export type GroupUpdate = {
  status?: ErrorGroupStatus;
  /** Solo con status ignored; null o ausente = para siempre. */
  ignoredUntil?: Date | null;
  note?: string | null;
};

/**
 * Cambia el estado o la nota de uno o varios grupos del espacio. Resolver
 * anota quien y cuando; reactivar lo borra; ignorar admite fecha de fin.
 * Devuelve cuantos grupos cambiaron.
 */
export const updateErrorGroups = async (
  workspaceId: number,
  fingerprints: string[],
  update: GroupUpdate,
  userId: number | null,
  now = new Date(),
): Promise<number> => {
  const data: Prisma.ErrorGroupUpdateManyMutationInput = {};
  if (update.note !== undefined) data.note = update.note;
  if (update.status === "resolved") Object.assign(data, { status: "resolved", resolvedAt: now, ignoredUntil: null });
  if (update.status === "active") Object.assign(data, { status: "active", resolvedAt: null, ignoredUntil: null });
  if (update.status === "ignored") Object.assign(data, { status: "ignored", resolvedAt: null, ignoredUntil: update.ignoredUntil ?? null });
  if (Object.keys(data).length === 0) throw new ErrorGroupError("Nothing to update", 400);

  // updateMany no admite relaciones: quien resolvio va en una segunda pasada.
  const result = await prisma.errorGroup.updateMany({ where: { workspaceId, fingerprint: { in: fingerprints } }, data });
  if (update.status === "resolved") {
    await prisma.errorGroup.updateMany({
      where: { workspaceId, fingerprint: { in: fingerprints } },
      data: { resolvedById: userId },
    });
  }
  return result.count;
};

export type LifecycleSummary = {
  /** Grupos vistos por primera vez en la ventana. */
  newInWindow: number;
  /** Grupos que volvieron a aparecer tras resolverse, en la ventana. */
  regressedInWindow: number;
  /** Grupos resueltos en la ventana. */
  resolvedInWindow: number;
  /** Tiempo medio hasta resolver (desde la primera vez o la ultima regresion), de los resueltos en la ventana. */
  mttrMs: number | null;
};

/**
 * Cifras del ciclo de vida en una ventana, para el resumen de Errores, los
 * reportes y el resumen programado. `application` acota por la aplicacion
 * de la primera ocurrencia.
 */
export const lifecycleSummary = async (
  workspaceId: number,
  from: Date,
  to: Date,
  scope: { application?: string; applicationsIn?: string[] } = {},
): Promise<LifecycleSummary> => {
  const conditions: Prisma.Sql[] = [Prisma.sql`"workspaceId" = ${workspaceId}`];
  if (scope.application) conditions.push(Prisma.sql`"application" ILIKE ${`%${scope.application}%`}`);
  if (scope.applicationsIn?.length) conditions.push(Prisma.sql`"application" = ANY(${scope.applicationsIn})`);
  const where = Prisma.join(conditions, " AND ");
  const [row] = await prisma.$queryRaw<
    Array<{ newInWindow: number; regressedInWindow: number; resolvedInWindow: number; mttrMs: number | null }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE "firstSeen" BETWEEN ${from} AND ${to})::int AS "newInWindow",
      COUNT(*) FILTER (WHERE "lastRegressedAt" BETWEEN ${from} AND ${to})::int AS "regressedInWindow",
      COUNT(*) FILTER (WHERE "status" = 'resolved' AND "resolvedAt" BETWEEN ${from} AND ${to})::int AS "resolvedInWindow",
      (AVG(EXTRACT(EPOCH FROM ("resolvedAt" - COALESCE("lastRegressedAt", "firstSeen"))) * 1000)
        FILTER (WHERE "status" = 'resolved' AND "resolvedAt" BETWEEN ${from} AND ${to}))::float8 AS "mttrMs"
    FROM "ErrorGroup"
    WHERE ${where}
  `;
  return {
    newInWindow: Number(row?.newInWindow ?? 0),
    regressedInWindow: Number(row?.regressedInWindow ?? 0),
    resolvedInWindow: Number(row?.resolvedInWindow ?? 0),
    mttrMs: row?.mttrMs === null || row?.mttrMs === undefined ? null : Math.round(Number(row.mttrMs)),
  };
};
