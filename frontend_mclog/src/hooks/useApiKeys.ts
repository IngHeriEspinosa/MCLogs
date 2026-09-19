import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type ApiKeyScope = "ingest" | "read" | "metrics";

export type ApiKey = {
  id: number;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  applications: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreateApiKeyInput = {
  name: string;
  scopes: ApiKeyScope[];
  applications?: string[];
  expiresAt?: string | null;
};

/** Respuesta del alta: `key` es el secreto en claro y no vuelve a mostrarse. */
export type CreatedApiKey = { key: string; apiKey: ApiKey };

export const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  ingest: "Enviar logs",
  read: "Consultar logs y errores",
  metrics: "Leer métricas Prometheus",
};

export const useApiKeys = () =>
  useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => (await client.get("/api/keys")).data.data,
  });

export const useCreateApiKey = () => {
  const qc = useQueryClient();
  return useMutation<CreatedApiKey, unknown, CreateApiKeyInput>({
    mutationFn: async (input) => (await client.post("/api/keys", input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
};

export const useRevokeApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/api/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
};
