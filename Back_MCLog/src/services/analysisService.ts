import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { LogFilters, buildWhere } from "./logService";

/**
 * Consultas de analisis: lo que hace falta para investigar un incidente, no
 * solo para listar registros. Son las que alimentan la vista de errores del
 * dashboard y las herramientas MCP.
 */

export const MAX_TRACE_LOGS = 1000;
export const MAX_APPLICATIONS = 200;

export type ErrorGroup = {
  fingerprint: string;
  application: string;
  service: string | null;
  level: string;
  errorName: string | null;
  errorCode: string | null;
  sampleMessage: string;
  lastLogId: number;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
};

type GroupSample = {
  fingerprint: string;
  id: number;
  application: string;
  service: string | null;
  level: string;
  errorName: string | null;
  errorCode: string | null;
  message: string;
};

/**
 * Agrupa los logs por huella y devuelve los grupos mas frecuentes.
 *
 * Es la consulta que responde "que esta fallando", frente al listado plano que
 * solo responde "que ha pasado". Va en dos pasos a proposito: la agregacion con
 * la API tipada de Prisma (que asi reutiliza los filtros de visibilidad tal
 * cual), y una sola consulta en crudo para traer un ejemplo por grupo, porque
 * DISTINCT ON no tiene equivalente en Prisma.
 */
export const getErrorGroups = async (filters: LogFilters, limit = 50): Promise<ErrorGroup[]> => {
  const where: Prisma.LogWhereInput = { AND: [buildWhere(filters), { fingerprint: { not: null } }] };

  const groups = await prisma.log.groupBy({
    by: ["fingerprint"],
    where,
    _count: { _all: true },
    _min: { timestamp: true },
    _max: { timestamp: true },
    orderBy: { _count: { fingerprint: "desc" } },
    take: limit,
  });

  const fingerprints = groups.map((group) => group.fingerprint).filter((value): value is string => value !== null);
  if (fingerprints.length === 0) return [];

  // Un ejemplo por grupo: el mas reciente, que es el que interesa al investigar.
  const samples = await prisma.$queryRaw<GroupSample[]>`
    SELECT DISTINCT ON ("fingerprint")
      "fingerprint", "id", "application", "service", "level"::text AS "level",
      "errorName", "errorCode", "message"
    FROM "Log"
    WHERE "workspaceId" = ${filters.workspaceId} AND "fingerprint" = ANY(${fingerprints})
    ORDER BY "fingerprint", "timestamp" DESC
  `;

  const sampleByFingerprint = new Map(samples.map((sample) => [sample.fingerprint, sample]));

  return groups.flatMap((group) => {
    const fingerprint = group.fingerprint;
    const sample = fingerprint ? sampleByFingerprint.get(fingerprint) : undefined;
    if (!fingerprint || !sample) return [];
    return [
      {
        fingerprint,
        application: sample.application,
        service: sample.service,
        level: sample.level,
        errorName: sample.errorName,
        errorCode: sample.errorCode,
        sampleMessage: sample.message,
        lastLogId: sample.id,
        count: group._count._all,
        firstSeen: group._min.timestamp!,
        lastSeen: group._max.timestamp!,
      },
    ];
  });
};

/**
 * Todos los logs de una traza, en orden cronologico. Es la forma de seguir una
 * operacion que cruza varios sistemas.
 */
export const getTrace = async (traceId: string, filters: Pick<LogFilters, "workspaceId" | "applicationsIn">) => {
  return prisma.log.findMany({
    where: { AND: [buildWhere({ ...filters, traceId })] },
    orderBy: { timestamp: "asc" },
    take: MAX_TRACE_LOGS,
  });
};

/**
 * Lo que ocurrio alrededor de un log concreto, en la misma aplicacion y
 * servicio. Un error aislado dice poco; lo que suele explicarlo son las lineas
 * inmediatamente anteriores.
 */
export const getLogContext = async (
  id: number,
  options: { beforeSeconds?: number; afterSeconds?: number; limit?: number } = {},
  filters: Pick<LogFilters, "workspaceId" | "applicationsIn">,
) => {
  const { beforeSeconds = 60, afterSeconds = 60, limit = 50 } = options;

  const target = await prisma.log.findFirst({ where: { id, workspaceId: filters.workspaceId } });
  if (!target) return null;

  const applications = filters.applicationsIn;
  if (applications?.length && !applications.includes(target.application)) return null;

  const from = new Date(target.timestamp.getTime() - beforeSeconds * 1000);
  const to = new Date(target.timestamp.getTime() + afterSeconds * 1000);

  const logs = await prisma.log.findMany({
    where: {
      workspaceId: target.workspaceId,
      application: target.application,
      // Solo se acota por servicio si el log lo tiene: si no, se veria vacio.
      ...(target.service ? { service: target.service } : {}),
      timestamp: { gte: from, lte: to },
    },
    orderBy: { timestamp: "asc" },
    take: limit,
  });

  return { target, from, to, logs };
};

export type ApplicationSummary = {
  application: string;
  services: string[];
  environments: string[];
  /** Logs dentro de la ventana consultada, no el total historico. */
  count: number;
  lastSeen: Date;
  errorsLast24h: number;
};

/** Ventana por defecto del inventario: lo que ha emitido algo en la ultima semana. */
export const DEFAULT_APPLICATIONS_HOURS = 24 * 7;

/**
 * Inventario de lo que esta emitiendo logs. Es lo primero que necesita quien
 * (o lo que) llega sin saber que aplicaciones existen.
 *
 * Solo mira desde `from`. Sin ventana recorria la tabla entera en cada
 * llamada: con 2 millones de logs tardaba de 2 a 12 s, segun hubiera cache, y
 * crecia con la tabla; con la ventana por defecto baja a unos 0,2 s. Una
 * aplicacion que lleve mas tiempo sin emitir no aparece.
 *
 * La agregacion va en dos pasos. Primero por aplicacion, servicio y entorno,
 * que son pocas combinaciones y se agrupan en memoria; despues, sobre ese
 * resultado ya pequeno, por aplicacion. En un solo paso los ARRAY_AGG(DISTINCT)
 * obligaban a ordenar todas las filas, y el orden acababa en disco.
 */
export const listApplications = async (
  workspaceId: number,
  applicationsIn: string[] | undefined,
  from: Date,
): Promise<ApplicationSummary[]> => {
  const scope = applicationsIn?.length
    ? Prisma.sql`AND "application" = ANY(${applicationsIn})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<Omit<ApplicationSummary, "count" | "errorsLast24h"> & { count: bigint | number; errorsLast24h: bigint | number }>
  >`
    WITH "combos" AS (
      SELECT
        "application",
        "service",
        "environment",
        COUNT(*) AS "count",
        MAX("timestamp") AS "lastSeen",
        COUNT(*) FILTER (
          WHERE "level" = 'error' AND "timestamp" >= NOW() - INTERVAL '24 hours'
        ) AS "errors"
      FROM "Log"
      WHERE "workspaceId" = ${workspaceId} AND "timestamp" >= ${from} ${scope}
      GROUP BY "application", "service", "environment"
    )
    SELECT
      "application",
      COALESCE(ARRAY_AGG(DISTINCT "service") FILTER (WHERE "service" IS NOT NULL), '{}') AS "services",
      ARRAY_AGG(DISTINCT "environment"::text) AS "environments",
      SUM("count")::int AS "count",
      MAX("lastSeen") AS "lastSeen",
      SUM("errors")::int AS "errorsLast24h"
    FROM "combos"
    GROUP BY "application"
    ORDER BY "count" DESC
    LIMIT ${MAX_APPLICATIONS}
  `;

  return rows.map((row) => ({
    ...row,
    count: Number(row.count),
    errorsLast24h: Number(row.errorsLast24h),
  }));
};

export type TimelineBucket = {
  bucket: Date;
  error: number;
  warn: number;
  info: number;
  debug: number;
};

/**
 * Serie por hora de logs por nivel. Sirve para ver de un vistazo cuando empezo
 * algo a fallar, que es la primera pregunta de cualquier incidente.
 */
export const getLevelTimeline = async (
  filters: LogFilters,
  from: Date,
  to: Date,
): Promise<TimelineBucket[]> => {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"workspaceId" = ${filters.workspaceId}`,
    Prisma.sql`"timestamp" >= ${from}`,
    Prisma.sql`"timestamp" <= ${to}`,
  ];

  if (filters.application) conditions.push(Prisma.sql`"application" ILIKE ${`%${filters.application}%`}`);
  if (filters.environment) conditions.push(Prisma.sql`"environment" = ${filters.environment}::"Environment"`);
  if (filters.applicationsIn?.length) conditions.push(Prisma.sql`"application" = ANY(${filters.applicationsIn})`);

  const rows = await prisma.$queryRaw<Array<{ bucket: Date; error: number; warn: number; info: number; debug: number }>>`
    SELECT
      DATE_TRUNC('hour', "timestamp") AS "bucket",
      COUNT(*) FILTER (WHERE "level" = 'error')::int AS "error",
      COUNT(*) FILTER (WHERE "level" = 'warn')::int  AS "warn",
      COUNT(*) FILTER (WHERE "level" = 'info')::int  AS "info",
      COUNT(*) FILTER (WHERE "level" = 'debug')::int AS "debug"
    FROM "Log"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map((row) => ({
    bucket: row.bucket,
    error: Number(row.error),
    warn: Number(row.warn),
    info: Number(row.info),
    debug: Number(row.debug),
  }));
};
