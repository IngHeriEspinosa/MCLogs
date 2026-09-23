import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { Workspace } from "@/hooks/useWorkspaces";

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
  /** Rol de plataforma: `admin` gestiona las cuentas, no los datos de otros espacios. */
  role: "user" | "admin";
  /** Cuenta de arranque del servicio: no se puede eliminar ni degradar. */
  isRoot: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  activatedAt: string | null;
  /** Espacios a los que pertenece, con su rol en cada uno. */
  workspaces: Workspace[];
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

/** Con el segundo factor activo, el login no abre sesion: devuelve un token para el paso 2. */
export type LoginResponse = { mfaRequired?: boolean; mfaToken?: string };

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) =>
      (await client.post<LoginResponse>("/auth/login", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
  });
};

export const useLoginSecondFactor = () =>
  useMutation({
    mutationFn: (data: { mfaToken: string; code: string }) => client.post("/auth/login/2fa", data),
  });

/** Pide el enlace por correo. Responde igual exista o no la cuenta; 503 si el servidor no puede enviar correos. */
export const useForgotPassword = () =>
  useMutation({
    mutationFn: (data: { email: string; locale: string }) => client.post("/auth/password/forgot", data),
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (data: { token: string; password: string }) => client.post("/auth/password/reset", data),
  });

export type TwoFactorSetup ={ secret: string; otpauthUri: string; qrCode: string };

export const useStartTwoFactor = () =>
  useMutation({
    mutationFn: async () => (await client.post<{ data: TwoFactorSetup }>("/auth/me/2fa/setup")).data.data,
  });

export const useEnableTwoFactor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) =>
      (await client.post<{ data: { recoveryCodes: string[] } }>("/auth/me/2fa/enable", { code })).data.data
        .recoveryCodes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
};

export const useDisableTwoFactor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string; code: string }) => client.post("/auth/me/2fa/disable", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
};

export const useDeleteAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string; code?: string }) => client.delete("/auth/me", { data }),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/";
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post("/auth/logout", {}),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/";
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
  message?: string;
  service?: string;
  host?: string;
  traceId?: string;
  errorName?: string;
  errorCode?: string;
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
