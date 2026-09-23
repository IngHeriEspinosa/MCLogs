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
};

export const PASSWORD_MIN_LENGTH = 8;

export const useUsers = () =>
  useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: async () => (await client.get("/auth/users")).data.data,
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; role: UserRole }) =>
      client.post("/auth/users", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
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
