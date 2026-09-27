import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";
import type { ApiKeyInventory } from "@/common/keys/inventory";

const INVENTORY_KEY = ["key-inventory"] as const;

/** Inventario de claves de toda la plataforma. Solo responde al admin de plataforma. */
export const useKeyInventory = (enabled: boolean) =>
  useQuery<ApiKeyInventory>({
    queryKey: INVENTORY_KEY,
    queryFn: async () => (await client.get("/api/admin/keys")).data,
    enabled,
  });

/** Revoca cualquier clave, de cualquier espacio. */
export const useRevokeAnyKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/api/admin/keys/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVENTORY_KEY });
      // La clave puede ser del espacio activo: su lista tambien cambia.
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
};
