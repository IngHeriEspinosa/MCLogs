import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/common/api/client";

export type AlertChannelType = "webhook" | "email" | "telegram" | "pagerduty";
export const ALERT_RULE_TYPES = ["threshold", "new_error_group", "regression", "error_rate", "silence", "spike"] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

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
  /** Volumen minimo de la ventana para error_rate y spike. */
  minVolume: number;
  /** firing mientras la condicion se cumple (reglas continuas). */
  state: "ok" | "firing";
  mutedUntil: string | null;
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
  /** trigger = se cumplio la condicion; resolve = se despejo. */
  kind: "trigger" | "resolve";
  rule: { id: number; name: string; type: AlertRuleType };
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
    mutationFn: ({ id, ...changes }: { id: number; name?: string; enabled?: boolean; config?: Record<string, unknown> }) =>
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
  service?: string | null;
  environment?: string | null;
  level: string;
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;
  minVolume?: number;
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
    mutationFn: ({ id, ...changes }: Partial<RuleInput> & { id: number; enabled?: boolean; mutedUntil?: string | null }) =>
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

// --- Resumenes programados ---

export type Digest = {
  id: number;
  name: string;
  frequency: "daily" | "weekly";
  hourUtc: number;
  weekday: number;
  environment: string | null;
  enabled: boolean;
  lastSentAt: string | null;
  channels: AlertChannel[];
};

export type DigestInput = {
  name: string;
  frequency: "daily" | "weekly";
  hourUtc: number;
  weekday: number;
  environment: string | null;
  channelIds: number[];
};

export const useDigests = () =>
  useQuery<Digest[]>({
    queryKey: ["digests"],
    queryFn: async () => (await client.get("/api/alerts/digests")).data.data,
  });

export const useCreateDigest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DigestInput) => client.post("/api/alerts/digests", input),
    onSuccess: () => invalidate(qc, "digests"),
  });
};

export const useUpdateDigest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: Partial<DigestInput> & { id: number; enabled?: boolean }) => client.patch(`/api/alerts/digests/${id}`, changes),
    onSuccess: () => invalidate(qc, "digests"),
  });
};

export const useDeleteDigest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/api/alerts/digests/${id}`),
    onSuccess: () => invalidate(qc, "digests"),
  });
};

/** Envia el resumen ahora, para probarlo. Devuelve el resultado de cada canal. */
export const useSendDigest = () =>
  useMutation<Delivery[], unknown, number>({
    mutationFn: async (id) => (await client.post(`/api/alerts/digests/${id}/send`)).data.data,
  });
