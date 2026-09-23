import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import {
  getActiveWorkspaceId,
  getStoredWorkspaceId,
  setActiveWorkspaceId,
  subscribeActiveWorkspace,
} from "@/common/workspace/active";
import { useMe } from "@/hooks/useAuth";

export type WorkspaceRole = "owner" | "member";

export type Workspace = {
  id: number;
  name: string;
  role: WorkspaceRole;
  memberCount: number;
  createdAt: string;
};

export type WorkspaceMember = {
  userId: number;
  email: string;
  role: WorkspaceRole;
  /** La persona aun no ha elegido su contrasena con el enlace de invitacion. */
  pending: boolean;
  twoFactorEnabled: boolean;
  joinedAt: string;
};

/** Resultado de invitar: si no salio el correo, `invitePath` es el enlace para compartirlo a mano. */
export type InviteResult = {
  member: WorkspaceMember;
  created: boolean;
  emailSent: boolean;
  invitePath?: string;
};

/** Enlace completo de una invitacion, con el origen de este mismo panel. */
export const inviteLink = (path: string) =>
  typeof window === "undefined" ? path : `${window.location.origin}${path}`;

/** Parametro de la URL con el que un enlace (p. ej. el de una alerta) abre un espacio concreto. */
const URL_PARAM = "ws";

/** Datos que dependen del espacio: todo menos la sesion. */
const isWorkspaceData = (queryKey: readonly unknown[]) => queryKey[0] !== "me";

/**
 * Espacio activo y la lista de espacios de la sesion.
 *
 * Valida el espacio recordado contra los de la cuenta: si ya no pertenece a
 * el (la sacaron, se borro), pasa al primero que tenga. Tambien atiende
 * `?ws=<id>` en la URL, para que el enlace de una alerta abra su espacio.
 */
export const useWorkspace = () => {
  const me = useMe();
  const qc = useQueryClient();
  const activeId = useSyncExternalStore(subscribeActiveWorkspace, getActiveWorkspaceId, () => null);

  const workspaces = me.data?.workspaces ?? [];
  const current = workspaces.find((workspace) => workspace.id === activeId) ?? null;

  useEffect(() => {
    if (!me.isSuccess) return;
    const list = me.data.workspaces;

    const params = new URLSearchParams(window.location.search);
    const fromUrl = Number(params.get(URL_PARAM));
    if (params.has(URL_PARAM)) {
      params.delete(URL_PARAM);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    const candidates = [fromUrl, getActiveWorkspaceId(), getStoredWorkspaceId()];
    const chosen = candidates.map((id) => list.find((workspace) => workspace.id === id)).find(Boolean) ?? list[0];
    const next = chosen?.id ?? null;
    if (next === getActiveWorkspaceId()) {
      setActiveWorkspaceId(next); // marca como listo si aun no lo estaba
      return;
    }

    const hadWorkspace = getActiveWorkspaceId() !== null;
    setActiveWorkspaceId(next);
    // Si ya se habian cargado datos de otro espacio, se descartan.
    if (hadWorkspace) void qc.resetQueries({ predicate: (query) => isWorkspaceData(query.queryKey) });
  }, [me.isSuccess, me.data, qc]);

  const switchTo = useCallback(
    (id: number) => {
      if (id === getActiveWorkspaceId()) return;
      setActiveWorkspaceId(id);
      // Sin datos del espacio anterior ni un instante: se vacia y se vuelve a pedir.
      void qc.resetQueries({ predicate: (query) => isWorkspaceData(query.queryKey) });
    },
    [qc],
  );

  return {
    workspaces,
    current,
    /** true cuando ya se sabe que espacio es (o que no hay ninguno). */
    ready: me.isSuccess && (current !== null || workspaces.length === 0),
    isOwner: current?.role === "owner",
    isPlatformAdmin: me.data?.role === "admin",
    /** La cuenta de arranque del servicio: la unica que ve la configuracion. */
    isRoot: me.data?.isRoot === true,
    switchTo,
  };
};

// --- Espacios ---

export const useCreateWorkspace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await client.post<{ data: Workspace }>("/api/workspaces", { name })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
};

export const useRenameWorkspace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => client.patch(`/api/workspaces/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
};

export const useDeleteWorkspace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: number; confirmName: string }) =>
      client.delete(`/api/workspaces/${id}`, { data: { confirmName } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
};

// --- Miembros ---

export const useMembers = (workspaceId: number | undefined, enabled = true) =>
  useQuery<WorkspaceMember[]>({
    queryKey: ["members", workspaceId],
    queryFn: async () => (await client.get(`/api/workspaces/${workspaceId}/members`)).data.data,
    enabled: enabled && workspaceId !== undefined,
  });

const useMemberMutation = <T, R>(mutationFn: (input: T) => Promise<R>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
};

export const useAddMember = () =>
  useMemberMutation(
    async ({ workspaceId, ...body }: { workspaceId: number; email: string; role: WorkspaceRole; locale: string }) =>
      (await client.post<{ data: InviteResult }>(`/api/workspaces/${workspaceId}/members`, body)).data.data,
  );

export const useUpdateMember = () =>
  useMemberMutation(({ workspaceId, userId, role }: { workspaceId: number; userId: number; role: WorkspaceRole }) =>
    client.patch(`/api/workspaces/${workspaceId}/members/${userId}`, { role }),
  );

export const useRemoveMember = () =>
  useMemberMutation(({ workspaceId, userId }: { workspaceId: number; userId: number }) =>
    client.delete(`/api/workspaces/${workspaceId}/members/${userId}`),
  );

export const useResendInvite = () =>
  useMutation({
    mutationFn: async ({ workspaceId, userId, locale }: { workspaceId: number; userId: number; locale: string }) =>
      (
        await client.post<{ data: Pick<InviteResult, "emailSent" | "invitePath"> }>(
          `/api/workspaces/${workspaceId}/members/${userId}/resend`,
          { locale },
        )
      ).data.data,
  });
