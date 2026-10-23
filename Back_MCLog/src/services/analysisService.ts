import { Prisma, type Log } from "@prisma/client";
import { prisma } from "../config/prisma";
import { LogFilters, buildWhere, buildWhereSql } from "./logService";
import { FingerprintParts, computeFingerprint, fingerprintParts, normalizeMessage } from "../utils/fingerprint";
import { GroupStatusFilter, lifecycleOf, statusConditionSql } from "./errorGroupService";
import type { ErrorGroupStatus } from "@prisma/client";

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
  /** El mensaje del ejemplo sin sus datos variables: lo que comparten todas las ocurrencias. */
  messageTemplate: string;
  lastLogId: number;
  /** Ocurrencias, primera y ultima vez dentro de la ventana. */
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Ciclo de vida (ErrorGroup): estado, primera vez de verdad y regresiones. */
  status: ErrorGroupStatus;
  firstSeenEver: Date;
  totalCount: number;
  resolvedAt: Date | null;
  ignoredUntil: Date | null;
  regressionCount: number;
  lastRegressedAt: Date | null;
  firstRelease: string | null;
  lastRelease: string | null;
  note: string | null;
  /** Con `withSeries`: SERIES_POINTS cuentas repartidas por la ventana. */
  series?: number[];
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

/** Orden de la vista de errores: por ocurrencias en la ventana, o por la ultima o la primera vez en ella. */
export const GROUP_SORTS = ["count", "lastSeen", "firstSeen"] as const;
export type GroupSort = (typeof GROUP_SORTS)[number];

const GROUP_ORDER: Record<GroupSort, Prisma.Sql> = {
  count: Prisma.sql`"count" DESC, "lastSeen" DESC`,
  lastSeen: Prisma.sql`"lastSeen" DESC`,
  firstSeen: Prisma.sql`"firstSeen" DESC`,
};

export type ErrorGroupOptions = {
  limit?: number;
  /** Solo los grupos en ese estado del ciclo de vida (ver errorGroupService). */
  status?: GroupStatusFilter;
  sort?: GroupSort;
  /** Ademas, una serie de SERIES_POINTS cuentas por grupo, para el sparkline. */
  withSeries?: boolean;
};

/** Puntos de la serie de cada grupo: bastan para ver si sube, baja o fue un pico. */
export const SERIES_POINTS = 24;

/**
 * Agrupa los logs por huella y devuelve los grupos de la ventana.
 *
 * Es la consulta que responde "que esta fallando", frente al listado plano que
 * solo responde "que ha pasado". Las cuentas salen de Log con los mismos
 * filtros que el listado; el estado, la primera vez de verdad y las
 * regresiones, de ErrorGroup. El filtro de estado va como subconsulta sobre
 * ErrorGroup, para no mezclar sus columnas con las de Log en los filtros.
 */
export const getErrorGroups = async (filters: LogFilters, options: ErrorGroupOptions | number = {}): Promise<ErrorGroup[]> => {
  const { limit = 50, status, sort = "count", withSeries = false } = typeof options === "number" ? { limit: options } : options;
  const statusFilter = status
    ? Prisma.sql`AND "fingerprint" IN (
        SELECT "fingerprint" FROM "ErrorGroup" WHERE "workspaceId" = ${filters.workspaceId} AND ${statusConditionSql(status)}
      )`
    : Prisma.empty;

  const groups = await prisma.$queryRaw<Array<{ fingerprint: string; count: number; firstSeen: Date; lastSeen: Date }>>`
    SELECT "fingerprint", COUNT(*)::int AS "count", MIN("timestamp") AS "firstSeen", MAX("timestamp") AS "lastSeen"
    FROM "Log"
    WHERE ${buildWhereSql(filters)} AND "fingerprint" IS NOT NULL ${statusFilter}
    GROUP BY "fingerprint"
    ORDER BY ${GROUP_ORDER[sort]}
    LIMIT ${limit}
  `;

  const fingerprints = groups.map((group) => group.fingerprint);
  if (fingerprints.length === 0) return [];

  // Un ejemplo por grupo: el mas reciente que cumple los mismos filtros que el
  // conteo. Sin ellos, el ejemplo podia ser posterior a la ventana, de otro
  // nivel o, con una huella propia del emisor, de una aplicacion que la clave
  // no puede ver. El LATERAL con LIMIT 1 se queda en el primer log de cada
  // huella por el indice (workspaceId, fingerprint, timestamp), en lugar de
  // recorrer todo su historico como hacia el DISTINCT ON.
  const [samples, lifecycle, series] = await Promise.all([
    prisma.$queryRaw<GroupSample[]>`
      SELECT "sample".*
      FROM UNNEST(${fingerprints}::text[]) AS "wanted"("fingerprint")
      CROSS JOIN LATERAL (
        SELECT
          "fingerprint", "id", "application", "service", "level"::text AS "level",
          "errorName", "errorCode", "message"
        FROM "Log"
        WHERE ${buildWhereSql(filters)} AND "fingerprint" = "wanted"."fingerprint"
        ORDER BY "timestamp" DESC, "id" DESC
        LIMIT 1
      ) AS "sample"
    `,
    lifecycleOf(filters.workspaceId, fingerprints),
    withSeries && filters.from && filters.to ? groupSeries(filters, fingerprints) : Promise.resolve(null),
  ]);

  const sampleByFingerprint = new Map(samples.map((sample) => [sample.fingerprint, sample]));

  return groups.flatMap((group) => {
    const sample = sampleByFingerprint.get(group.fingerprint);
    if (!sample) return [];
    const life = lifecycle.get(group.fingerprint);
    return [
      {
        fingerprint: group.fingerprint,
        application: sample.application,
        service: sample.service,
        level: sample.level,
        errorName: sample.errorName,
        errorCode: sample.errorCode,
        sampleMessage: sample.message,
        messageTemplate: normalizeMessage(sample.message),
        lastLogId: sample.id,
        count: Number(group.count),
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        // Sin fila de ciclo de vida (huella anterior a la migracion que no ha
        // vuelto a llegar) se presenta como activo.
        status: life?.status ?? "active",
        firstSeenEver: life?.firstSeenEver ?? group.firstSeen,
        totalCount: life?.totalCount ?? Number(group.count),
        resolvedAt: life?.resolvedAt ?? null,
        ignoredUntil: life?.ignoredUntil ?? null,
        regressionCount: life?.regressionCount ?? 0,
        lastRegressedAt: life?.lastRegressedAt ?? null,
        firstRelease: life?.firstRelease ?? null,
        lastRelease: life?.lastRelease ?? null,
        note: life?.note ?? null,
        ...(series ? { series: series.get(group.fingerprint) ?? new Array<number>(SERIES_POINTS).fill(0) } : {}),
      },
    ];
  });
};

/**
 * Serie de SERIES_POINTS intervalos iguales entre `from` y `to` por huella. El
 * intervalo no es redondo (la ventana entre 24): aqui solo importa la forma.
 */
const groupSeries = async (filters: LogFilters, fingerprints: string[]) => {
  const from = filters.from!;
  const to = filters.to!;
  const stepMs = Math.max(1000, Math.ceil((to.getTime() - from.getTime()) / SERIES_POINTS));
  const rows = await prisma.$queryRaw<Array<{ fingerprint: string; slot: number; count: number }>>`
    SELECT "fingerprint",
      LEAST(${SERIES_POINTS - 1}, FLOOR(EXTRACT(EPOCH FROM ("timestamp" - ${from}::timestamp)) * 1000 / ${stepMs}))::int AS "slot",
      COUNT(*)::int AS "count"
    FROM "Log"
    WHERE ${buildWhereSql(filters)} AND "fingerprint" = ANY(${fingerprints})
    GROUP BY 1, 2
  `;
  const byFingerprint = new Map<string, number[]>();
  for (const row of rows) {
    const list = byFingerprint.get(row.fingerprint) ?? new Array<number>(SERIES_POINTS).fill(0);
    list[Math.max(0, Number(row.slot))] += Number(row.count);
    byFingerprint.set(row.fingerprint, list);
  }
  return byFingerprint;
};

export type TraceResult = {
  /** En orden cronologico; con `omitted`, el principio y el final de la traza. */
  logs: Log[];
  /** Logs de la traza visibles para la peticion, aunque no vengan todos. */
  total: number;
  /** Los del medio que no se devuelven por pasar de MAX_TRACE_LOGS. */
  omitted: number;
};

/**
 * Todos los logs de una traza, en orden cronologico. Es la forma de seguir una
 * operacion que cruza varios sistemas.
 *
 * Los empates de timestamp (un lote sin hora propia entra con la misma) se
 * deshacen por id, para que el orden no cambie de una carga a otra. Si la
 * traza pasa de MAX_TRACE_LOGS se devuelven la primera y la ultima mitad: el
 * principio explica como empezo la operacion y el final suele ser donde fallo,
 * asi que cortar solo por un lado perdia justo una de las dos.
 */
export const getTrace = async (
  traceId: string,
  filters: Pick<LogFilters, "workspaceId" | "applicationsIn">,
): Promise<TraceResult> => {
  const where: Prisma.LogWhereInput = { AND: [buildWhere({ ...filters, traceId })] };
  // Uno de mas para saber, sin un COUNT aparte, si la traza cabe entera.
  const head = await prisma.log.findMany({
    where,
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    take: MAX_TRACE_LOGS + 1,
  });
  if (head.length <= MAX_TRACE_LOGS) return { logs: head, total: head.length, omitted: 0 };

  const half = Math.floor(MAX_TRACE_LOGS / 2);
  const [total, tail] = await Promise.all([
    prisma.log.count({ where }),
    prisma.log.findMany({ where, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: half }),
  ]);
  const logs = [...head.slice(0, half), ...tail.reverse()];
  return { logs, total, omitted: Math.max(0, total - logs.length) };
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

/**
 * Probabilidad de que el fallo se repita, en la aplicacion, el servicio y el
 * entorno del log. Cada periodo de reloj observado es un ensayo: hubo al menos
 * una ocurrencia o no la hubo. La proxima hora se estima con las horas de los
 * ultimos 7 dias, y las proximas 24 h con los dias de los ultimos 30.
 *
 * Las 24 h no salen de elevar la probabilidad horaria a 24 horas
 * independientes: los fallos llegan en rachas, y un incidente de un dia daba
 * casi un 100 % a un error que llevaba una semana sin aparecer.
 */
export type FailureRecurrence = {
  /** Inicio de la observacion: el primer log de ese servicio y entorno en los ultimos 30 dias. */
  observedFrom: Date;
  /** Horas de reloj observadas en los ultimos 7 dias (ver `countTrials`). */
  observedHours: number;
  /** De esas, en cuantas ocurrio el fallo. */
  activeHours: number;
  /** Probabilidad de al menos una ocurrencia en la proxima hora. */
  nextHour: number;
  /** Dias de reloj (UTC) observados en los ultimos 30 dias. */
  observedDays: number;
  /** De esos, en cuantos ocurrio el fallo. */
  activeDays: number;
  /** Probabilidad de al menos una ocurrencia en las proximas 24 h. */
  next24h: number;
};

/**
 * Que parte de las operaciones (traceId distintos) de la aplicacion, servicio
 * y entorno del log acaba en este fallo, en los ultimos 7 dias.
 */
export type FailureRate = {
  application: string;
  service: string | null;
  environment: string;
  operations: number;
  /** Operaciones que registraron este fallo. */
  failed: number;
  /** `failed / operations`, o null si el servicio no envia traceId. */
  rate: number | null;
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
  recurrence: FailureRecurrence;
  failureRate: FailureRate;
  /**
   * Las piezas de la huella de este log, para explicar por que se agrupan sus
   * ocurrencias. `computed` es false si la huella la mando el emisor con su
   * propio criterio: entonces las piezas no la explican.
   */
  grouping: FingerprintParts & { computed: boolean };
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Ventanas de observacion de la recurrencia. */
const RECURRENCE_HOURS_WINDOW_MS = 7 * DAY_MS;
const RECURRENCE_DAYS_WINDOW_MS = 30 * DAY_MS;

/**
 * Regla de sucesion de Laplace: (aciertos + 1) / (ensayos + 2). Con pocos
 * datos no afirma ni 0 % ni 100 %, y con muchos converge a la frecuencia.
 */
export const laplace = (hits: number, trials: number) => (hits + 1) / (trials + 2);

/**
 * Ensayos y aciertos en periodos de `periodMs` (horas o dias de reloj UTC)
 * entre `observedFrom` y `now`.
 *
 * El periodo en curso solo cuenta si ya tuvo una ocurrencia: si no la ha
 * tenido todavia, su resultado aun no se conoce. Contarlo como fallido, como
 * se hacia antes, rebajaba la probabilidad en cada consulta hecha a mitad de
 * hora.
 */
export const countTrials = (occurrences: Date[], observedFrom: Date, now: Date, periodMs: number) => {
  const period = (date: Date) => Math.floor(date.getTime() / periodMs);
  const current = period(now);
  const first = period(observedFrom);
  const active = new Set(occurrences.map(period).filter((value) => value >= first && value <= current));
  const completed = Math.max(0, current - first);
  return { trials: completed + (active.has(current) ? 1 : 0), hits: active.size };
};

/**
 * Probabilidad de repeticion a partir de las horas con ocurrencias
 * (`hours`, truncadas o no a la hora) de los ultimos 30 dias, observando
 * desde `observedFrom`.
 */
export const recurrenceOf = (hours: Date[], observedFrom: Date, now: Date): FailureRecurrence => {
  const hourlyFrom = new Date(Math.max(observedFrom.getTime(), now.getTime() - RECURRENCE_HOURS_WINDOW_MS));
  const dailyFrom = new Date(Math.max(observedFrom.getTime(), now.getTime() - RECURRENCE_DAYS_WINDOW_MS));
  const hourly = countTrials(hours, hourlyFrom, now, HOUR_MS);
  const daily = countTrials(hours, dailyFrom, now, DAY_MS);
  return {
    observedFrom,
    observedHours: hourly.trials,
    activeHours: hourly.hits,
    nextHour: laplace(hourly.hits, hourly.trials),
    observedDays: daily.trials,
    activeDays: daily.hits,
    next24h: laplace(daily.hits, daily.trials),
  };
};

/**
 * Cuantas veces ha ocurrido el fallo de un log: en las ultimas 24 h, en 7 dias
 * y en todo lo que conserva la retencion, por entorno. Es lo que dice si un
 * error es aislado o cronico, y si pasa solo en produccion. Con los ultimos 7
 * dias estima tambien la probabilidad de que se repita y la parte de las
 * operaciones de su servicio que acaba en el.
 *
 * La huella no incluye el entorno, asi que el mismo fallo en desarrollo y en
 * produccion comparte grupo; por eso el desglose. Las ocurrencias y sus horas
 * van sobre el indice (workspaceId, fingerprint, timestamp); el inicio de la
 * observacion y las operaciones, sobre (workspaceId, application, timestamp).
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

  const day = new Date(now.getTime() - DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const month = new Date(now.getTime() - RECURRENCE_DAYS_WINDOW_MS);
  // Una huella propia del emisor puede repetirse en varias aplicaciones: la
  // clave acotada solo cuenta las suyas.
  const scope = filters.applicationsIn?.length
    ? Prisma.sql`AND "application" = ANY(${filters.applicationsIn})`
    : Prisma.empty;

  const [rows, hours, serviceFirst, operations] = await Promise.all([
    prisma.$queryRaw<
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
    `,
    // La recurrencia mira el mismo ambito que la tasa por operacion: la
    // aplicacion, el servicio y el entorno del log. Mezclar entornos hacia que
    // las ocurrencias de desarrollo subieran la probabilidad en produccion.
    prisma.$queryRaw<Array<{ hour: Date }>>`
      SELECT DISTINCT date_trunc('hour', "timestamp") AS "hour"
      FROM "Log"
      WHERE "workspaceId" = ${filters.workspaceId} AND "fingerprint" = ${target.fingerprint}
        AND "application" = ${target.application}
        AND "service" IS NOT DISTINCT FROM ${target.service}::text
        AND "environment" = ${target.environment}::"Environment"
        AND "timestamp" >= ${month} AND "timestamp" <= ${now}
    `,
    // Desde cuando se puede observar el fallo: antes de que el servicio
    // enviara logs no podia ocurrir, y contar esas horas bajaria la probabilidad.
    prisma.log.findFirst({
      where: {
        workspaceId: filters.workspaceId,
        application: target.application,
        service: target.service,
        environment: target.environment,
        timestamp: { gte: month },
      },
      orderBy: { timestamp: "asc" },
      select: { timestamp: true },
    }),
    // El log ya esta dentro del alcance de la clave, y con el su aplicacion.
    prisma.$queryRaw<Array<{ operations: number; failed: number }>>`
      SELECT
        COUNT(DISTINCT "traceId")::int AS "operations",
        COUNT(DISTINCT "traceId") FILTER (WHERE "fingerprint" = ${target.fingerprint})::int AS "failed"
      FROM "Log"
      WHERE "workspaceId" = ${filters.workspaceId} AND "application" = ${target.application}
        AND "service" IS NOT DISTINCT FROM ${target.service}::text
        AND "environment" = ${target.environment}::"Environment"
        AND "timestamp" >= ${week} AND "traceId" IS NOT NULL
    `,
  ]);

  const environments = rows.map((row) => ({
    ...row,
    total: Number(row.total),
    last24h: Number(row.last24h),
    last7d: Number(row.last7d),
  }));
  // Solo vacia si la retencion borro el log entre las dos consultas.
  if (environments.length === 0) return { occurrences: null };
  const sum = (key: "total" | "last24h" | "last7d") => environments.reduce((acc, row) => acc + row[key], 0);
  const activeHours = hours.map((row) => row.hour);
  const observedFrom = new Date(
    Math.min((serviceFirst?.timestamp ?? month).getTime(), ...activeHours.map((hour) => hour.getTime())),
  );
  const operationCount = Number(operations[0]?.operations ?? 0);
  const failedCount = Number(operations[0]?.failed ?? 0);

  return {
    occurrences: {
      fingerprint: target.fingerprint,
      total: sum("total"),
      last24h: sum("last24h"),
      last7d: sum("last7d"),
      firstSeen: new Date(Math.min(...environments.map((row) => row.firstSeen.getTime()))),
      lastSeen: new Date(Math.max(...environments.map((row) => row.lastSeen.getTime()))),
      environments,
      recurrence: recurrenceOf(activeHours, observedFrom, now),
      grouping: { ...fingerprintParts(target), computed: computeFingerprint(target) === target.fingerprint },
      failureRate: {
        application: target.application,
        service: target.service,
        environment: target.environment,
        operations: operationCount,
        failed: failedCount,
        rate: operationCount > 0 ? failedCount / operationCount : null,
      },
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
  /** Errores dentro de la ventana consultada. */
  errors: number;
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
    Array<
      Omit<ApplicationSummary, "count" | "errors" | "errorsLast24h"> & {
        count: bigint | number;
        errors: bigint | number;
        errorsLast24h: bigint | number;
      }
    >
  >`
    WITH "combos" AS (
      SELECT
        "application",
        "service",
        "environment",
        COUNT(*) AS "count",
        MAX("timestamp") AS "lastSeen",
        COUNT(*) FILTER (WHERE "level" = 'error') AS "errors",
        COUNT(*) FILTER (
          WHERE "level" = 'error' AND "timestamp" >= ${new Date(Date.now() - DAY_MS)}
        ) AS "errorsLast24h"
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
      SUM("errors")::int AS "errors",
      SUM("errorsLast24h")::int AS "errorsLast24h"
    FROM "combos"
    GROUP BY "application"
    ORDER BY "count" DESC
    LIMIT ${MAX_APPLICATIONS}
  `;

  return rows.map((row) => ({
    ...row,
    count: Number(row.count),
    errors: Number(row.errors),
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

/** Intervalos admitidos en la serie, en segundos, por su nombre en la query (`bucket=`). */
export const TIMELINE_BUCKETS = { "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 } as const;
export type TimelineBucketName = keyof typeof TIMELINE_BUCKETS;

/**
 * Intervalo de la serie segun lo que abarca la ventana. Con horas fijas, los
 * rangos de 5 minutos o de 1 hora salian como una o dos barras, y 90 dias como
 * 2160, mas de las que el dashboard llega a pintar.
 */
export const timelineBucketSeconds = (from: Date, to: Date): number => {
  const span = to.getTime() - from.getTime();
  if (span <= 6 * HOUR_MS) return TIMELINE_BUCKETS["5m"];
  if (span <= 48 * HOUR_MS) return TIMELINE_BUCKETS["15m"];
  if (span <= 31 * DAY_MS) return TIMELINE_BUCKETS["1h"];
  return TIMELINE_BUCKETS["1d"];
};

/**
 * Serie de logs por nivel en intervalos de `bucketSeconds`. Sirve para ver de
 * un vistazo cuando empezo algo a fallar, que es la primera pregunta de
 * cualquier incidente. La ventana `from`/`to` manda sobre la que traigan los
 * filtros.
 *
 * Los intervalos se alinean en UTC desde el 2000-01-01, igual que hacia
 * DATE_TRUNC con las horas, para que el dashboard los encaje sin desfases.
 * Solo vienen los intervalos con filas; los vacios los rellena quien pinta.
 */
export const getLevelTimeline = async (
  filters: LogFilters,
  from: Date,
  to: Date,
  bucketSeconds = timelineBucketSeconds(from, to),
): Promise<TimelineBucket[]> => {
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; error: number; warn: number; info: number; debug: number }>>`
    SELECT
      DATE_BIN(${`${bucketSeconds} seconds`}::interval, "timestamp", TIMESTAMP '2000-01-01') AS "bucket",
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

export type TraceSummary = {
  traceId: string;
  /** Logs de la traza dentro de la ventana. */
  count: number;
  errors: number;
  warnings: number;
  applications: string[];
  services: string[];
  start: Date;
  end: Date;
  /** `end - start`, en milisegundos. */
  durationMs: number;
};

export type TraceListOptions = { page: number; pageSize: number; onlyErrors: boolean };

/**
 * Operaciones (traceId distintos) con logs en la ventana, de la mas reciente a
 * la mas antigua: la entrada a la trazabilidad sin tener que llegar desde un
 * log. Cuenta solo los logs que caen en la ventana y cumplen los filtros, asi
 * que una operacion que empezo antes aparece recortada; su detalle completo
 * es GET /api/logs/trace/:traceId.
 *
 * COUNT(*) OVER () da el total de operaciones en la misma consulta que la
 * pagina, despues del HAVING.
 */
export const listTraces = async (filters: LogFilters, options: TraceListOptions) => {
  const having = options.onlyErrors ? Prisma.sql`HAVING COUNT(*) FILTER (WHERE "level" = 'error') > 0` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    Array<Omit<TraceSummary, "durationMs"> & { total: number }>
  >`
    SELECT
      "traceId",
      COUNT(*)::int AS "count",
      COUNT(*) FILTER (WHERE "level" = 'error')::int AS "errors",
      COUNT(*) FILTER (WHERE "level" = 'warn')::int AS "warnings",
      ARRAY_AGG(DISTINCT "application") AS "applications",
      COALESCE(ARRAY_AGG(DISTINCT "service") FILTER (WHERE "service" IS NOT NULL), '{}') AS "services",
      MIN("timestamp") AS "start",
      MAX("timestamp") AS "end",
      (COUNT(*) OVER ())::int AS "total"
    FROM "Log"
    WHERE ${buildWhereSql(filters)} AND "traceId" IS NOT NULL
    GROUP BY "traceId"
    ${having}
    ORDER BY MAX("timestamp") DESC, "traceId"
    LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
  `;

  const total = Number(rows[0]?.total ?? 0);
  return {
    data: rows.map(({ total: _total, ...row }) => ({
      ...row,
      count: Number(row.count),
      errors: Number(row.errors),
      warnings: Number(row.warnings),
      durationMs: row.end.getTime() - row.start.getTime(),
    })),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
};

export type LatencyRow = {
  application: string;
  service: string | null;
  /** Logs con durationMs en la ventana. */
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

/**
 * Percentiles de duracion por aplicacion y servicio, con los logs que traen
 * `durationMs`. Los peores (por p95) primero. Sin durationMs no hay nada que
 * medir y la lista sale vacia.
 */
export const getLatency = async (filters: LogFilters, limit = 20): Promise<LatencyRow[]> => {
  const rows = await prisma.$queryRaw<Array<Omit<LatencyRow, "count"> & { count: number }>>`
    SELECT
      "application", "service", COUNT(*)::int AS "count",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p50",
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p95",
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p99",
      MAX("durationMs")::int AS "max"
    FROM "Log"
    WHERE ${buildWhereSql(filters)} AND "durationMs" IS NOT NULL
    GROUP BY "application", "service"
    ORDER BY "p95" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    ...row,
    count: Number(row.count),
    p50: Math.round(Number(row.p50)),
    p95: Math.round(Number(row.p95)),
    p99: Math.round(Number(row.p99)),
    max: Number(row.max),
  }));
};

export type ReleaseRow = {
  application: string;
  release: string;
  /** Primer y ultimo log de esa release dentro de la ventana. */
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  errors: number;
  /** Fallos que aparecieron por primera vez con esta release (ErrorGroup.firstRelease). */
  newGroups: number;
};

/**
 * Releases que emitieron logs en la ventana, la mas reciente primero: cuando
 * aparecio cada una, cuanto volumen y cuantos errores trajo, y cuantos fallos
 * nuevos estrenó. Es la forma de responder "¿esto empezo con el despliegue?".
 */
export const listReleases = async (filters: LogFilters, limit = 50): Promise<ReleaseRow[]> => {
  const rows = await prisma.$queryRaw<Array<ReleaseRow>>`
    SELECT
      "r"."application", "r"."release", "r"."firstSeen", "r"."lastSeen", "r"."count", "r"."errors",
      (
        SELECT COUNT(*)::int FROM "ErrorGroup" "g"
        WHERE "g"."workspaceId" = ${filters.workspaceId}
          AND "g"."application" = "r"."application" AND "g"."firstRelease" = "r"."release"
      ) AS "newGroups"
    FROM (
      SELECT "application", "release", MIN("timestamp") AS "firstSeen", MAX("timestamp") AS "lastSeen",
        COUNT(*)::int AS "count", COUNT(*) FILTER (WHERE "level" = 'error')::int AS "errors"
      FROM "Log"
      WHERE ${buildWhereSql(filters)} AND "release" IS NOT NULL
      GROUP BY "application", "release"
    ) "r"
    ORDER BY "r"."firstSeen" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ ...row, count: Number(row.count), errors: Number(row.errors), newGroups: Number(row.newGroups) }));
};
