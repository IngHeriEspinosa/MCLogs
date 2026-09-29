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
  lastLogId: number;
  count: number;
  firstSeen: string;
  lastSeen: string;
};

export type ErrorGroupFilters = {
  /** Ventana relativa; se ignora si llega `from`. */
  hours?: number;
  from?: string;
  to?: string;
  application?: string;
  environment?: string;
  level?: string;
  /** Maximo 100 en el backend. */
  limit?: number;
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

export const useErrorGroups = (filters: ErrorGroupFilters, enabled = true) =>
  useQuery<{ data: ErrorGroup[]; from: string; to: string }>({
    queryKey: ["error-groups", filters],
    queryFn: async () => (await client.get("/api/logs/errors/groups", { params: clean({ limit: 100, ...filters }) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useTrace = (traceId: string) =>
  useQuery<{ data: LogEntry[]; traceId: string; total: number }>({
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

/** Probabilidad de que el fallo se repita, con las horas en que ocurrio en los ultimos 7 dias. */
export type FailureRecurrence = {
  /** Primer log de la aplicacion en los ultimos 7 dias. */
  observedFrom: string;
  observedHours: number;
  activeHours: number;
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
  errorsLast24h: number;
};

export const useApplications = () =>
  useQuery<ApplicationSummary[]>({
    queryKey: ["applications"],
    queryFn: async () => (await client.get("/api/logs/applications")).data.data,
    staleTime: 60_000,
  });
