import { keepPreviousData, useQuery } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { LogEntry, LogsResponse } from "@/hooks/useAuth";

export type ErrorGroup = {
  fingerprint: string;
  application: string;
  service: string | null;
  level: string;
  errorName: string | null;
  errorCode: string | null;
  sampleMessage: string;
  /** El mensaje sin sus datos variables; ausente en snapshots y APIs anteriores. */
  messageTemplate?: string;
  // Ciclo de vida (ErrorGroup). Ausente en snapshots y en una API anterior.
  status?: ErrorGroupStatus;
  /** Primera vez de verdad, no solo dentro de la ventana. */
  firstSeenEver?: string;
  totalCount?: number;
  resolvedAt?: string | null;
  ignoredUntil?: string | null;
  regressionCount?: number;
  lastRegressedAt?: string | null;
  firstRelease?: string | null;
  lastRelease?: string | null;
  note?: string | null;
  /** Con `series`: 24 cuentas repartidas por la ventana, para el sparkline. */
  series?: number[];
  lastLogId: number;
  count: number;
  firstSeen: string;
  lastSeen: string;
};

export type ErrorGroupStatus = "active" | "resolved" | "ignored";
/** Filtro de la vista de errores; `regressed` = activos que volvieron tras resolverse. */
export type ErrorGroupStatusFilter = ErrorGroupStatus | "regressed";

/** Cifras del ciclo de vida en la ventana. */
export type ErrorLifecycle = { newInWindow: number; regressedInWindow: number; resolvedInWindow: number; mttrMs: number | null };

export type ErrorGroupFilters = {
  /** Ventana relativa; se ignora si llega `from`. */
  hours?: number;
  from?: string;
  to?: string;
  application?: string;
  environment?: string;
  level?: string;
  /** Maximo 200 en el backend. Se piden 101 para saber si hay mas de 100. */
  limit?: number;
  status?: ErrorGroupStatusFilter;
  sort?: "count" | "lastSeen" | "firstSeen";
  search?: string;
  service?: string;
  /** Pide la serie de cada grupo, para el sparkline. */
  series?: boolean;
};

/** Grupos que se enseñan; se pide uno mas para saber si hay mas ("100+"). */
export const GROUPS_SHOWN = 100;

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

export const useErrorGroups = (filters: ErrorGroupFilters, enabled = true) =>
  useQuery<{ data: ErrorGroup[]; lifecycle?: ErrorLifecycle; from: string; to: string }>({
    queryKey: ["error-groups", filters],
    queryFn: async () =>
      (
        await client.get("/api/logs/errors/groups", {
          params: clean({ limit: GROUPS_SHOWN + 1, ...filters, series: filters.series ? "true" : undefined }),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export type TraceResponse = {
  data: LogEntry[];
  traceId: string;
  /** Logs de la traza entera, aunque `data` no los traiga todos. */
  total: number;
  /** Si es true, `data` lleva el principio y el final, y faltan `omitted` del medio. */
  truncated: boolean;
  omitted: number;
};

export const useTrace = (traceId: string) =>
  useQuery<TraceResponse>({
    queryKey: ["trace", traceId],
    queryFn: async () => (await client.get(`/api/logs/trace/${encodeURIComponent(traceId)}`)).data,
    enabled: traceId.length > 0,
    retry: false,
  });

/** Cuantos registros tiene una traza, sin traerlos: basta el total de una pagina de uno. Con `traceId` null no se pide nada. */
export const useTraceCount = (traceId: string | null) =>
  useQuery<number>({
    queryKey: ["trace-count", traceId],
    queryFn: async () => (await client.get<LogsResponse>("/api/logs", { params: { traceId, pageSize: 1 } })).data.total,
    enabled: traceId !== null,
    retry: false,
  });

/** Las ocurrencias mas recientes de un fallo (misma huella). Con `fingerprint` null no se pide nada. */
export const useFailureSamples = (fingerprint: string | null, limit: number) =>
  useQuery<LogsResponse>({
    queryKey: ["failure-samples", fingerprint, limit],
    queryFn: async () =>
      (await client.get<LogsResponse>("/api/logs", { params: { fingerprint, pageSize: limit, sort: "timestamp:desc" } })).data,
    enabled: fingerprint !== null,
    retry: false,
  });

export type LogContext = {
  target: LogEntry;
  from: string;
  to: string;
  data: LogEntry[];
  total: number;
};

/** Contexto de un log. `enabled` permite pedirlo solo al desplegarlo. */
export const useLogContext = (id: number | null) =>
  useQuery<LogContext>({
    queryKey: ["log-context", id],
    queryFn: async () => (await client.get(`/api/logs/${id}/context`, { params: { before: 120, after: 120 } })).data,
    enabled: id !== null,
    retry: false,
  });

type OccurrenceCounts = {
  total: number;
  last24h: number;
  last7d: number;
  firstSeen: string;
  lastSeen: string;
};

/**
 * Probabilidad de que el fallo se repita en su aplicacion, servicio y entorno:
 * la proxima hora con las horas de los ultimos 7 dias, y las proximas 24 h con
 * los dias de los ultimos 30.
 */
export type FailureRecurrence = {
  /** Primer log de ese servicio y entorno en los ultimos 30 dias. */
  observedFrom: string;
  observedHours: number;
  activeHours: number;
  /** Ausentes en una API anterior, que estimaba las 24 h con las horas. */
  observedDays?: number;
  activeDays?: number;
  /** Probabilidades de 0 a 1 (regla de sucesion de Laplace). */
  nextHour: number;
  next24h: number;
};

/** Operaciones (traceId distintos) del mismo servicio y entorno que acabaron en el fallo, en 7 dias. */
export type FailureRate = {
  application: string;
  service: string | null;
  environment: LogEntry["environment"];
  operations: number;
  failed: number;
  /** Null si no hay operaciones con traceId. */
  rate: number | null;
};

/** Cuantas veces ha ocurrido el fallo de un log, en total y por entorno. */
export type FailureOccurrences = OccurrenceCounts & {
  fingerprint: string;
  /** Del entorno con mas ocurrencias al que menos. */
  environments: Array<OccurrenceCounts & { environment: LogEntry["environment"] }>;
  recurrence: FailureRecurrence;
  failureRate: FailureRate;
  /** Piezas de la huella; ausente en una API anterior. */
  grouping?: FingerprintGrouping;
};

/**
 * Lo que entra en la huella de un log, ya normalizado. Con `computed` false la
 * huella la mando el emisor con su propio criterio y estas piezas no la explican.
 */
export type FingerprintGrouping = {
  application: string;
  service: string | null;
  errorName: string | null;
  errorCode: string | null;
  firstFrame: string | null;
  messageTemplate: string;
  computed: boolean;
};

export type FailureOccurrencesResponse = {
  /** El total solo abarca lo que conserva la retencion. */
  retentionMonths: number;
  /** Null si el log no tiene huella. */
  data: FailureOccurrences | null;
};

/** Ocurrencias del fallo de un log. Con `id` null no se pide nada. */
export const useFailureOccurrences = (id: number | null) =>
  useQuery<FailureOccurrencesResponse>({
    queryKey: ["failure-occurrences", id],
    queryFn: async () => (await client.get(`/api/logs/${id}/occurrences`)).data,
    enabled: id !== null,
    retry: false,
  });

export type ApplicationSummary = {
  application: string;
  services: string[];
  environments: string[];
  count: number;
  lastSeen: string;
  /** Errores dentro de la ventana pedida. Ausente en una API anterior. */
  errors?: number;
  errorsLast24h: number;
};

export type ApplicationsParams = {
  /** Ventana relativa (24 a 744 h); por defecto, la ultima semana. */
  hours?: number;
  from?: string;
  to?: string;
  application?: string;
  environment?: string;
};

/** Aplicaciones que han enviado logs en la ventana; sin parametros, en la ultima semana. */
export const useApplications = (params: ApplicationsParams = {}) =>
  useQuery<ApplicationSummary[]>({
    queryKey: ["applications", params],
    queryFn: async () => (await client.get("/api/logs/applications", { params: clean(params) })).data.data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

/** Una operacion (traceId) con logs en la ventana. */
export type TraceSummary = {
  traceId: string;
  count: number;
  errors: number;
  warnings: number;
  applications: string[];
  services: string[];
  start: string;
  end: string;
  durationMs: number;
};

export type TracesParams = {
  hours?: number;
  from?: string;
  to?: string;
  application?: string;
  environment?: string;
  onlyErrors?: boolean;
  page?: number;
  pageSize?: number;
};

/** Operaciones de la ventana, de la mas reciente a la mas antigua. */
export const useTraces = (params: TracesParams) =>
  useQuery<{ data: TraceSummary[]; page: number; pageSize: number; total: number; totalPages: number; from: string; to: string }>({
    queryKey: ["traces", params],
    queryFn: async () =>
      (await client.get("/api/logs/traces", { params: clean({ ...params, onlyErrors: params.onlyErrors ? "true" : undefined }) })).data,
    placeholderData: keepPreviousData,
  });

/** Un log por id, para abrir su detalle desde un enlace (`/logs?log=123`). Con `id` null no se pide nada. */
export const useLogById = (id: number | null) =>
  useQuery<LogEntry>({
    queryKey: ["log", id],
    queryFn: async () => (await client.get(`/api/logs/${id}`)).data,
    enabled: id !== null,
    retry: false,
  });
