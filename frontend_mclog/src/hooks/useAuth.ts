import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type LogEntry = {
  id: number;
  timestamp: string;
  application: string;
  service?: string | null;
  host?: string | null;
  level: "debug" | "info" | "warn" | "error";
  environment: "development" | "staging" | "production";
  message: string;
  traceId?: string | null;
  spanId?: string | null;
  metadata?: Record<string, unknown> | null;
  errorName?: string | null;
  errorCode?: string | null;
  errorStack?: string | null;
  /** Huella de agrupacion: identifica ocurrencias del mismo fallo. */
  fingerprint?: string | null;
};

/** Un punto de la serie por hora que devuelve /api/logs/stats. */
export type TimelineBucket = {
  bucket: string;
  error: number;
  warn: number;
  info: number;
  debug: number;
};

export type LogsResponse = {
  data: LogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LogStats = {
  total: number;
  last24h: number;
  byLevel: { level: string; count: number }[];
  byApplication: { application: string; count: number }[];
  byEnvironment: { environment: string; count: number }[];
  timeline: TimelineBucket[];
  from: string;
  to: string;
};

export type CurrentUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  createdAt: string;
};

/**
 * Usuario de la sesion actual.
 *
 * Se consulta al backend en lugar de leer el JWT porque el token vive en una
 * cookie httpOnly que el navegador no puede leer, y porque el rol puede haber
 * cambiado despues de emitirse.
 */
export const useMe = () =>
  useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await client.get("/auth/me")).data.data,
    staleTime: 5 * 60_000,
    retry: false,
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      client.patch("/auth/me/password", data),
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) => client.post("/auth/login", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post("/auth/logout", {}),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/login";
    },
  });
};

export type LogsParams = {
  page?: number;
  pageSize?: number;
  level?: string;
  environment?: string;
  application?: string;
  sort?: string;
  search?: string;
  from?: string;
  to?: string;
  fingerprint?: string;
};

const cleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));

export const useLogs = (params: LogsParams) => {
  return useQuery<LogsResponse>({
    queryKey: ["logs", params],
    queryFn: async () => {
      const res = await client.get("/api/logs", { params: cleanParams(params) });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });
};

export type StatsParams = {
  from?: string;
  to?: string;
  hours?: number;
  application?: string;
  environment?: string;
};

/**
 * Totales y serie horaria. La serie respeta la ventana; los totales (`total`,
 * `byLevel`, `byApplication`...) son historicos, acotados solo por aplicacion
 * y entorno.
 */
export const useLogStats = (params: StatsParams = {}) => {
  return useQuery<LogStats>({
    queryKey: ["logs", "stats", params],
    queryFn: async () => {
      const res = await client.get("/api/logs/stats", { params: cleanParams(params) });
      return res.data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
};
