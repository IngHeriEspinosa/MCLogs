import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type AlertChannelType = "webhook" | "email" | "telegram";
export type AlertRuleType = "threshold" | "new_error_group";

export type AlertChannel = {
  id: number;
  name: string;
  type: AlertChannelType;
  /** Los secretos llegan enmascarados; reenviarlos tal cual los conserva. */
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type AlertRule = {
  id: number;
  name: string;
  type: AlertRuleType;
  enabled: boolean;
  application: string | null;
  service: string | null;
  environment: string | null;
  level: string;
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  channels: AlertChannel[];
};

export type Delivery = { channelId: number; channelName: string; ok: boolean; error?: string };

export type AlertEvent = {
  id: number;
  ruleId: number;
  triggeredAt: string;
  count: number;
  sampleLogIds: number[];
  deliveries: Delivery[];
  rule: { id: number; name: string; type: AlertRuleType };
};

export const CHANNEL_LABELS: Record<AlertChannelType, string> = {
  webhook: "Webhook",
  email: "Correo",
  telegram: "Telegram",
};

const invalidate = (qc: ReturnType<typeof useQueryClient>, ...keys: string[]) =>
  keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));

// --- Canales ---

export const useAlertChannels = () =>
  useQuery<AlertChannel[]>({
    queryKey: ["alert-channels"],
    queryFn: async () => (await client.get("/api/alerts/channels")).data.data,
  });

export const useCreateChannel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: AlertChannelType; config: Record<string, unknown> }) =>
      client.post("/api/alerts/channels", input),
    onSuccess: () => invalidate(qc, "alert-channels", "alert-rules"),
  });
};

export const useUpdateChannel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: number; name?: string; enabled?: boolean }) =>
      client.patch(`/api/alerts/channels/${id}`, changes),
    onSuccess: () => invalidate(qc, "alert-channels", "alert-rules"),
  });
};

export const useDeleteChannel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/api/alerts/channels/${id}`),
    onSuccess: () => invalidate(qc, "alert-channels", "alert-rules"),
  });
};

/** Envía un aviso de prueba. Un canal que falla responde 200 con `ok: false`. */
export const useTestChannel = () =>
  useMutation<Delivery, unknown, number>({
    mutationFn: async (id) => (await client.post(`/api/alerts/channels/${id}/test`)).data.data,
  });

// --- Reglas ---

export const useAlertRules = () =>
  useQuery<AlertRule[]>({
    queryKey: ["alert-rules"],
    queryFn: async () => (await client.get("/api/alerts/rules")).data.data,
  });

export type RuleInput = {
  name: string;
  type: AlertRuleType;
  application?: string | null;
  environment?: string | null;
  level: string;
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  channelIds: number[];
};

export const useCreateRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInput) => client.post("/api/alerts/rules", input),
    onSuccess: () => invalidate(qc, "alert-rules"),
  });
};

export const useUpdateRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: Partial<RuleInput> & { id: number; enabled?: boolean }) =>
      client.patch(`/api/alerts/rules/${id}`, changes),
    onSuccess: () => invalidate(qc, "alert-rules"),
  });
};

export const useDeleteRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/api/alerts/rules/${id}`),
    onSuccess: () => invalidate(qc, "alert-rules", "alert-events"),
  });
};

// --- Historial ---

export const useAlertEvents = () =>
  useQuery<AlertEvent[]>({
    queryKey: ["alert-events"],
    queryFn: async () => (await client.get("/api/alerts/events", { params: { limit: 50 } })).data.data,
  });
