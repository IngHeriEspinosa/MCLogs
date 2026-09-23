import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type SettingCategory = "workspaces" | "logs" | "features" | "security";

/** Una clave de la configuracion, tal como la devuelve el backend. */
export type Setting = {
  key: string;
  category: SettingCategory;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  value: number | boolean;
  defaultValue: number | boolean;
  /** Hay un valor guardado que sustituye al predeterminado. */
  overridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Lo que cualquier sesion necesita saber para no ofrecer lo que esta apagado. */
export type PublicSettings = {
  labEnabled: boolean;
  mcpEnabled: boolean;
  canCreateWorkspace: boolean;
  /** 0 = sin limite. */
  maxWorkspaceMembers: number;
  invitationTtlDays: number;
  publicSnapshotsEnabled: boolean;
  /** Logs que guarda un snapshot, como mucho. */
  maxSnapshotRows: number;
};

/** Valores con los que el panel se comporta como antes mientras carga. */
export const PUBLIC_DEFAULTS: PublicSettings = {
  labEnabled: true,
  mcpEnabled: true,
  canCreateWorkspace: true,
  maxWorkspaceMembers: 0,
  invitationTtlDays: 7,
  publicSnapshotsEnabled: true,
  maxSnapshotRows: 500,
};

export const usePublicSettings = () => {
  const query = useQuery<PublicSettings>({
    queryKey: ["settings", "public"],
    queryFn: async () => (await client.get("/api/settings/public")).data.data,
    staleTime: 5 * 60_000,
  });
  return query.data ?? PUBLIC_DEFAULTS;
};

/** Catalogo completo. Solo responde a la cuenta root. */
export const useSettings = (enabled: boolean) =>
  useQuery<Setting[]>({
    queryKey: ["settings", "all"],
    queryFn: async () => (await client.get("/api/settings")).data.data,
    enabled,
  });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, number | boolean>) =>
      (await client.patch<{ data: Setting[] }>("/api/settings", { values })).data.data,
    onSuccess: (data) => {
      qc.setQueryData(["settings", "all"], data);
      void qc.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
};

export const useResetSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => (await client.delete<{ data: Setting[] }>(`/api/settings/${key}`)).data.data,
    onSuccess: (data) => {
      qc.setQueryData(["settings", "all"], data);
      void qc.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
};
