import { createHmac } from "crypto";
import { NOTIFIER_TIMEOUT_MS, Notifier, alertTitle } from "../types";

/** Configuración esperada en `AlertChannel.config` para el tipo `webhook`. */
export type WebhookConfig = {
  url: string;
  /**
   * Si está presente, se firma el cuerpo con HMAC-SHA256 y se envía en la
   * cabecera `x-mclog-signature`. Permite al receptor comprobar que el aviso
   * viene de MCLog y no de cualquiera que conozca la URL.
   */
  secret?: string;
};

export const sendWebhook: Notifier = async (channel, payload) => {
  const config = channel.config as unknown as WebhookConfig;
  if (!config?.url) throw new Error("El canal webhook no tiene URL configurada");

  const body = JSON.stringify({ title: alertTitle(payload), ...payload });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "MCLog",
  };
  if (config.secret) {
    headers["x-mclog-signature"] = `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Se recorta: el cuerpo de error de un webhook ajeno puede ser una página entera.
    const detalle = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`HTTP ${response.status}${detalle ? `: ${detalle}` : ""}`);
  }
};
