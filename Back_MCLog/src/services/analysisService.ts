import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { LogFilters, buildWhere, buildWhereSql } from "./logService";

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

/** Un log del espacio, o null si no existe o queda fuera del alcance de la clave. */
const findScopedLog = async (id: number, filters: Pick<LogFilters, "workspaceId" | "applicationsIn">) => {
  const target = await prisma.log.findFirst({ where: { id, workspaceId: filters.workspaceId } });
  if (!target) return null;
  const applications = filters.applicationsIn;
  return applications?.length && !applications.includes(target.application) ? null : target;
};

/**
 * Reparte los huecos del contexto entre lo anterior y lo posterior. Lo
 * anterior se lleva la mitad mayor, porque es lo que suele explicar un error;
 * si un lado no llena su parte, el otro aprovecha el hueco.
 */
export const splitContextSlots = (slots: number, available: { before: number; after: number }) => {
  const after = Math.min(available.after, Math.max(Math.floor(slots / 2), slots - available.before));
  const before = Math.min(available.before, slots - after);
  return { before, after };
};

/**
 * Lo que ocurrio alrededor de un log concreto, en la misma aplicacion,
 * servicio y entorno. Un error aislado dice poco; lo que suele explicarlo son
 * las lineas inmediatamente anteriores.
 *
 * Va en dos consultas, hacia atras y hacia delante desde el log. Con una sola
 * en orden ascendente desde `from`, una aplicacion con trafico llenaba el
 * limite con lo mas antiguo de la ventana y el log, y lo que lo precedia,
 * podian quedarse fuera.
 */
export const getLogContext = async (
  id: number,
  options: { beforeSeconds?: number; afterSeconds?: number; limit?: number } = {},
  filters: Pick<LogFilters, "workspaceId" | "applicationsIn">,
) => {
  const { beforeSeconds = 60, afterSeconds = 60, limit = 50 } = options;

  const target = await findScopedLog(id, filters);
  if (!target) return null;

  const from = new Date(target.timestamp.getTime() - beforeSeconds * 1000);
  const to = new Date(target.timestamp.getTime() + afterSeconds * 1000);
  const scope: Prisma.LogWhereInput = {
    workspaceId: target.workspaceId,
    application: target.application,
    environment: target.environment,
    // Solo se acota por servicio si el log lo tiene: si no, se veria vacio.
    ...(target.service ? { service: target.service } : {}),
  };
  // Los empates de timestamp se deshacen por id, que crece con la llegada.
  const at = target.timestamp;
  const slots = limit - 1;

  const [previous, next] = await Promise.all([
    prisma.log.findMany({
      where: {
        ...scope,
        timestamp: { gte: from, lte: at },
        OR: [{ timestamp: { lt: at } }, { id: { lt: target.id } }],
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: slots,
    }),
    prisma.log.findMany({
      where: {
        ...scope,
        timestamp: { gte: at, lte: to },
        OR: [{ timestamp: { gt: at } }, { id: { gt: target.id } }],
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: slots,
    }),
  ]);

  const shares = splitContextSlots(slots, { before: previous.length, after: next.length });
  const logs = [...previous.slice(0, shares.before).reverse(), target, ...next.slice(0, shares.after)];

  return { target, from, to, logs };
};

export type EnvironmentOccurrences = {
  environment: string;
  total: number;
  last24h: number;
  last7d: number;
  firstSeen: Date;
  lastSeen: Date;
};

export type FailureOccurrences = {
  fingerprint: string;
  total: number;
  last24h: number;
  last7d: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Del entorno con mas ocurrencias al que menos. */
  environments: EnvironmentOccurrences[];
};

/**
 * Cuantas veces ha ocurrido el fallo de un log: en las ultimas 24 h, en 7 dias
 * y en todo lo que conserva la retencion, por entorno. Es lo que dice si un
 * error es aislado o cronico, y si pasa solo en produccion.
 *
 * La huella no incluye el entorno, asi que el mismo fallo en desarrollo y en
 * produccion comparte grupo; por eso el desglose. Una sola consulta sobre el
 * indice (workspaceId, fingerprint, timestamp).
 *
 * Devuelve null si el log no existe o queda fuera de alcance, y
 * `occurrences: null` si el log no tiene huella.
 */
export const getFailureOccurrences = async (
  id: number,
  filters: Pick<LogFilters, "workspaceId" | "applicationsIn">,
  now = new Date(),
): Promise<{ occurrences: FailureOccurrences | null } | null> => {
  const target = await findScopedLog(id, filters);
  if (!target) return null;
  if (!target.fingerprint) return { occurrences: null };

  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Una huella propia del emisor puede repetirse en varias aplicaciones: la
  // clave acotada solo cuenta las suyas.
  const scope = filters.applicationsIn?.length
    ? Prisma.sql`AND "application" = ANY(${filters.applicationsIn})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{ environment: string; total: number; last24h: number; last7d: number; firstSeen: Date; lastSeen: Date }>
  >`
    SELECT
      "environment"::text AS "environment",
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE "timestamp" >= ${day})::int AS "last24h",
      COUNT(*) FILTER (WHERE "timestamp" >= ${week})::int AS "last7d",
      MIN("timestamp") AS "firstSeen",
      MAX("timestamp") AS "lastSeen"
    FROM "Log"
    WHERE "workspaceId" = ${filters.workspaceId} AND "fingerprint" = ${target.fingerprint} ${scope}
    GROUP BY "environment"
    ORDER BY "total" DESC
  `;

  const environments = rows.map((row) => ({
    ...row,
    total: Number(row.total),
    last24h: Number(row.last24h),
    last7d: Number(row.last7d),
  }));
  // Solo vacia si la retencion borro el log entre las dos consultas.
  if (environments.length === 0) return { occurrences: null };
  const sum = (key: "total" | "last24h" | "last7d") => environments.reduce((acc, row) => acc + row[key], 0);

  return {
    occurrences: {
      fingerprint: target.fingerprint,
      total: sum("total"),
      last24h: sum("last24h"),
      last7d: sum("last7d"),
      firstSeen: new Date(Math.min(...environments.map((row) => row.firstSeen.getTime()))),
      lastSeen: new Date(Math.max(...environments.map((row) => row.lastSeen.getTime()))),
      environments,
    },
  };
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
 *
 * Admite los mismos filtros que el listado: con ellos, el inventario cuenta
 * solo los logs que los cumplen (p. ej. los de un servicio o un host).
 */
export const listApplications = async (filters: LogFilters & { from: Date }): Promise<ApplicationSummary[]> => {
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
      WHERE ${buildWhereSql(filters)}
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
 * algo a fallar, que es la primera pregunta de cualquier incidente. La ventana
 * `from`/`to` manda sobre la que traigan los filtros.
 */
export const getLevelTimeline = async (
  filters: LogFilters,
  from: Date,
  to: Date,
): Promise<TimelineBucket[]> => {
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; error: number; warn: number; info: number; debug: number }>>`
    SELECT
      DATE_TRUNC('hour', "timestamp") AS "bucket",
      COUNT(*) FILTER (WHERE "level" = 'error')::int AS "error",
      COUNT(*) FILTER (WHERE "level" = 'warn')::int  AS "warn",
      COUNT(*) FILTER (WHERE "level" = 'info')::int  AS "info",
      COUNT(*) FILTER (WHERE "level" = 'debug')::int AS "debug"
    FROM "Log"
    WHERE ${buildWhereSql({ ...filters, from, to })}
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
