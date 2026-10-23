import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { ErrorGroupStatus } from "@/hooks/useErrors";

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

/** Ventana y alcance comunes a latencia y releases. */
export type WindowParams = { hours?: number; from?: string; to?: string; application?: string; environment?: string };

export type GroupUpdate = {
  fingerprints: string[];
  status?: ErrorGroupStatus;
  /** Con status ignored: hasta cuando (null = para siempre). */
  ignoredUntil?: string | null;
  note?: string | null;
};

/** Resolver, ignorar o reactivar grupos (solo el dueno del espacio). */
export const useUpdateErrorGroups = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: GroupUpdate) => (await client.patch<{ updated: number }>("/api/logs/errors/groups", update)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["failure-occurrences"] });
    },
  });
};

export type LatencyRow = { application: string; service: string | null; count: number; p50: number; p95: number; p99: number; max: number };

/** Percentiles de duracion por servicio, con los logs que traen durationMs. */
export const useLatency = (params: WindowParams, enabled = true) =>
  useQuery<{ data: LatencyRow[]; from: string; to: string }>({
    queryKey: ["latency", params],
    queryFn: async () => (await client.get("/api/logs/latency", { params: clean(params) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export type ReleaseRow = {
  application: string;
  release: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  errors: number;
  newGroups: number;
};

/** Releases que emitieron logs en la ventana, la mas reciente primero. */
export const useReleases = (params: WindowParams, enabled = true) =>
  useQuery<{ data: ReleaseRow[]; from: string; to: string }>({
    queryKey: ["releases", params],
    queryFn: async () => (await client.get("/api/logs/releases", { params: clean(params) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export type SavedView = { id: number; name: string; path: string; query: string; createdAt: string };

/** Vistas guardadas del espacio. */
export const useSavedViews = () =>
  useQuery<SavedView[]>({
    queryKey: ["saved-views"],
    queryFn: async () => (await client.get("/api/views")).data.data,
    staleTime: 60_000,
  });

export const useCreateView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (view: { name: string; path: string; query: string }) => (await client.post("/api/views", view)).data.data as SavedView,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-views"] }),
  });
};

export const useDeleteView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await client.delete(`/api/views/${id}`)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-views"] }),
  });
};
