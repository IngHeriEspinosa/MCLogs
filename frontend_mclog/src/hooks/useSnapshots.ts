import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { LogEntry } from "@/hooks/useAuth";
import type { SortField } from "@/hooks/useLogFilters";

export type SnapshotVisibility = "workspace" | "public";

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
  visibility: SnapshotVisibility;
  redacted: boolean;
  filters: SnapshotFilters;
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

/** Lo que devuelve el enlace. */
export type Snapshot = {
  title: string;
  visibility: SnapshotVisibility;
  redacted: boolean;
  filters: SnapshotFilters;
  summary: SnapshotSummary;
  logs: LogEntry[];
  totalMatched: number;
  createdAt: string;
  expiresAt: string | null;
  /** Solo en los de equipo: quien lo abre ya es miembro. */
  workspaceName: string | null;
};

export type CreateSnapshotInput = {
  title: string;
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
        const res = await client.get(`/snapshots/${encodeURIComponent(token)}`);
        return { state: "ok", snapshot: res.data.data };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) return { state: "signIn" };
        if (axios.isAxiosError(error) && error.response?.status === 404) return { state: "notFound" };
        throw error;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
