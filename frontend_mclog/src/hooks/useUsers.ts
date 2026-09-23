import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type UserRole = "user" | "admin";

export type ManagedUser = {
  id: number;
  email: string;
  role: UserRole;
  isRoot: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  /** Null mientras la invitacion esta pendiente. */
  activatedAt: string | null;
  /** En cuantos espacios esta; el admin de plataforma no ve cuales. */
  workspaceCount: number;
};

/** Alta de cuenta: con espacio propio o dentro de uno del que eres dueño. */
export type CreateUserInput = {
  email: string;
  role: UserRole;
  mode: "own" | "join";
  workspaceName?: string;
  workspaceId?: number;
  workspaceRole?: "owner" | "member";
  locale: string;
};

export type CreateUserResult = { data: ManagedUser; emailSent: boolean; invitePath?: string };

export const PASSWORD_MIN_LENGTH = 8;

export const useUsers = () =>
  useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: async () => (await client.get("/auth/users")).data.data,
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await client.post<CreateUserResult>("/auth/users", input)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      // Si entro a uno de mis espacios, cambia su numero de miembros.
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: number; role?: UserRole; password?: string }) =>
      client.patch(`/auth/users/${id}`, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/auth/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
};
