import { AlertPayload, NOTIFIER_TIMEOUT_MS, Notifier, alertTitle, formatSample } from "../types";

/** Configuración esperada en `AlertChannel.config` para el tipo `pagerduty`. */
export type PagerDutyConfig = {
  /** Integration key de un servicio de PagerDuty (integración "Events API v2"). */
  routingKey: string;
};

export const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
/** Change events: entran en la línea de tiempo del servicio sin abrir incidente. */
export const PAGERDUTY_CHANGE_URL = "https://events.pagerduty.com/v2/change/enqueue";

/** Forma de una integration key: alfanumérica (32 caracteres en las actuales). */
export const isRoutingKey = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9]{20,64}$/.test(value);

/** Reglas que avisan de algo puntual y nunca envían recuperación. */
const DISCRETE_RULES = new Set(["new_error_group", "regression"]);

const SUMMARY_MAX = 1024;

/**
 * Clave de deduplicación: la misma para el disparo y la recuperación de una
 * regla continua, para que PagerDuty abra y cierre el mismo incidente. Un
 * fallo nuevo o una regresión de un solo fallo llevan además su huella, y así
 * cada fallo es un incidente propio.
 */
export const dedupKeyOf = (payload: AlertPayload): string => {
  const base = `mclog:rule:${payload.rule.id}`;
  const fingerprints = new Set(payload.samples.map((sample) => sample.fingerprint).filter(Boolean));
  if (DISCRETE_RULES.has(payload.rule.type) && fingerprints.size === 1) return `${base}:${[...fingerprints][0]}`;
  return base;
};

const severityOf = (payload: AlertPayload): "critical" | "error" | "warning" | "info" => {
  // Que algo deje de emitir es serio aunque la regla vigile logs de info.
  if (payload.rule.type === "silence") return "error";
  if (payload.level === "error") return "error";
  if (payload.level === "warn") return "warning";
  return "info";
};

/** Cuerpo de Events API v2 para un aviso (trigger) o su recuperación (resolve). */
export const pagerDutyEvent = (payload: AlertPayload, routingKey: string) => {
  const dedup_key = dedupKeyOf(payload);
  if (payload.kind === "resolve") return { routing_key: routingKey, event_action: "resolve", dedup_key };

  const links = payload.dashboardUrl ? [{ href: payload.dashboardUrl, text: "Ver en MCLog" }] : [];
  return {
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key,
    client: "MCLog",
    ...(payload.dashboardUrl ? { client_url: payload.dashboardUrl } : {}),
    links,
    payload: {
      summary: `${alertTitle(payload)} — ${payload.summary}`.slice(0, SUMMARY_MAX),
      source: payload.application ?? "mclog",
      severity: severityOf(payload),
      timestamp: payload.triggeredAt,
      class: payload.rule.type,
      ...(payload.environment ? { group: payload.environment } : {}),
      ...(payload.samples[0]?.service ? { component: payload.samples[0].service } : {}),
      custom_details: {
        count: payload.count,
        windowMinutes: payload.windowMinutes,
        threshold: payload.threshold,
        level: payload.level,
        samples: payload.samples.slice(0, 5).map(formatSample),
      },
    },
  };
};

/** POST a PagerDuty; responde 202 si acepta el evento. */
export const postPagerDuty = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detalle = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`PagerDuty HTTP ${response.status}${detalle ? `: ${detalle}` : ""}`);
  }
};

export const sendPagerDuty: Notifier = async (channel, payload) => {
  const settings = channel.config as unknown as PagerDutyConfig;
  if (!isRoutingKey(settings?.routingKey)) throw new Error("El canal de PagerDuty necesita una routingKey válida");
  await postPagerDuty(PAGERDUTY_EVENTS_URL, pagerDutyEvent(payload, settings.routingKey));
};
