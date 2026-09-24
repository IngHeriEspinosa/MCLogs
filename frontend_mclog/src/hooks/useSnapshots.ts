import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { LogEntry } from "@/hooks/useAuth";
import type { ErrorGroup } from "@/hooks/useErrors";
import type { SortField } from "@/hooks/useLogFilters";

export type SnapshotVisibility = "workspace" | "public";
/** La pantalla de la que sale: define la forma del resumen y de los logs. */
export type SnapshotKind = "logs" | "errors" | "trace";

/** Los filtros con los que se capturo, con el rango ya en fechas absolutas. */
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
  from?: string | null;
  to?: string | null;
  sortField?: SortField;
  sortDir?: "asc" | "desc";
};

/** Lo que se lista: sin los datos. */
export type SnapshotMeta = {
  id: number;
  token: string;
  title: string;
  kind: SnapshotKind;
  visibility: SnapshotVisibility;
  redacted: boolean;
  filters: SnapshotFilters;
  /** Logs que cumplian los filtros, ocurrencias de los fallos o registros de la traza. */
  totalMatched: number;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdById: number | null;
  createdByEmail: string | null;
};

export type SnapshotSummary = {
  total: number;
  byLevel: { error: number; warn: number; info: number; debug: number };
  timeline: { bucket: string; error: number; warn: number; info: number; debug: number }[];
  timelineFrom: string;
  byApplication: { application: string; count: number }[];
  byEnvironment: { environment: string; count: number }[];
  applications: number;
  applicationsWithErrors: number;
  distinctErrors: number;
  distinctErrorsCapped: boolean;
  topErrors: {
    fingerprint: string;
    application: string;
    errorName: string | null;
    sampleMessage: string;
    count: number;
    lastSeen: string;
  }[];
};

/** Errores: los grupos de fallo, y en `logs` el ejemplo mas reciente de cada uno. */
export type ErrorsSummary = {
  level: "error" | "warn";
  groups: ErrorGroup[];
  capped: boolean;
  occurrences: number;
};

/** Traza: los totales de la operacion entera, aunque no se guardaran todos sus logs. */
export type TraceSummary = {
  traceId: string;
  total: number;
  errors: number;
  applications: string[];
  durationMs: number;
};

type SnapshotBase = {
  title: string;
  visibility: SnapshotVisibility;
  redacted: boolean;
  filters: SnapshotFilters;
  logs: LogEntry[];
  totalMatched: number;
  createdAt: string;
  expiresAt: string | null;
  /** Solo en los de equipo: quien lo abre ya es miembro. */
  workspaceName: string | null;
};

/** Lo que devuelve el enlace. */
export type Snapshot = SnapshotBase &
  (
    | { kind: "logs"; summary: SnapshotSummary }
    | { kind: "errors"; summary: ErrorsSummary }
    | { kind: "trace"; summary: TraceSummary }
  );

export type CreateSnapshotInput = {
  title: string;
  kind: SnapshotKind;
  visibility: SnapshotVisibility;
  /** null = no caduca. */
  expiresInDays: 1 | 7 | 30 | null;
  filters: SnapshotFilters;
};

/** Donde se abre un snapshot. La ruta vive en el frontend; el token es todo lo que hace falta. */
export const snapshotUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/s/${encodeURIComponent(token)}`;

export const useSnapshots = () =>
  useQuery<SnapshotMeta[]>({
    queryKey: ["snapshots"],
    queryFn: async () => (await client.get("/api/snapshots")).data.data,
  });

export const useCreateSnapshot = () => {
  const qc = useQueryClient();
  return useMutation<SnapshotMeta, unknown, CreateSnapshotInput>({
    mutationFn: async (input) => (await client.post("/api/snapshots", input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshots"] }),
  });
};

export const useDeleteSnapshot = () => {
  const qc = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: async (id) => {
      await client.delete(`/api/snapshots/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshots"] }),
  });
};

export type SnapshotLoad =
  | { state: "ok"; snapshot: Snapshot }
  /** De equipo y sin sesion: hay que entrar para verlo. */
  | { state: "signIn" }
  /** No existe, caduco o no eres miembro: el servidor no distingue, y aqui tampoco. */
  | { state: "notFound" };

/**
 * Un snapshot por su enlace. Va con la sesion si la hay (los de equipo la
 * necesitan), pero un 401 aqui no manda al login por su cuenta: la pagina
 * ofrece entrar sin perder el enlace.
 */
export const usePublicSnapshot = (token: string) =>
  useQuery<SnapshotLoad>({
    queryKey: ["snapshot-view", token],
    queryFn: async () => {
      try {
        const res = await client.get(`/api/share/${encodeURIComponent(token)}`);
        return { state: "ok", snapshot: res.data.data };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) return { state: "signIn" };
        // 400 = enlace mal formado (cortado al copiarlo, por ejemplo): para quien lo abre es lo mismo que no existir.
        if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 400)) {
          return { state: "notFound" };
        }
        throw error;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
