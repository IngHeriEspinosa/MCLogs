import { useQuery } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { LogEntry } from "@/hooks/useAuth";

/** Ventanas que ofrece la vista de errores, en horas. */
export const WINDOWS = [
  { hours: 1, label: "1 hora" },
  { hours: 24, label: "24 horas" },
  { hours: 24 * 7, label: "7 días" },
  { hours: 24 * 30, label: "30 días" },
] as const;

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
  hours: number;
  application?: string;
  environment?: string;
  level?: string;
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

export const useErrorGroups = (filters: ErrorGroupFilters) =>
  useQuery<{ data: ErrorGroup[]; from: string; to: string }>({
    queryKey: ["error-groups", filters],
    queryFn: async () => (await client.get("/api/logs/errors/groups", { params: clean({ ...filters, limit: 50 }) })).data,
  });

export const useTrace = (traceId: string) =>
  useQuery<{ data: LogEntry[]; traceId: string; total: number }>({
    queryKey: ["trace", traceId],
    queryFn: async () => (await client.get(`/api/logs/trace/${encodeURIComponent(traceId)}`)).data,
    enabled: traceId.length > 0,
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
