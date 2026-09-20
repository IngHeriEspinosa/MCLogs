import { NOTIFIER_TIMEOUT_MS, Notifier, alertTitle, formatSample } from "../types";

/** Configuración esperada en `AlertChannel.config` para el tipo `telegram`. */
export type TelegramConfig = {
  /** Token del bot, tal como lo entrega BotFather. */
  botToken: string;
  /** Identificador del chat o canal de destino. */
  chatId: string;
};

/**
 * Escapa los caracteres reservados de MarkdownV2.
 *
 * Telegram rechaza el mensaje entero si alguno va sin escapar, y los mensajes
 * de error llevan paréntesis, guiones y puntos a montones.
 */
const escapeMarkdown = (value: string) => value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (match) => `\\${match}`);

export const sendTelegram: Notifier = async (channel, payload) => {
  const settings = channel.config as unknown as TelegramConfig;
  if (!settings?.botToken || !settings?.chatId) {
    throw new Error("El canal de Telegram necesita botToken y chatId");
  }

  const detalles = [
    `Coincidencias: ${payload.count} (umbral ${payload.threshold} en ${payload.windowMinutes} min)`,
    payload.application ? `Aplicación: ${payload.application}` : null,
    payload.environment ? `Entorno: ${payload.environment}` : null,
  ].filter(Boolean) as string[];

  const bloques = [
    `*${escapeMarkdown(alertTitle(payload))}*`,
    detalles.map(escapeMarkdown).join("\n"),
    // El bloque de código no necesita escapado interno salvo las comillas
    // invertidas y la barra, y conserva los mensajes legibles tal cual.
    payload.samples.length > 0
      ? "```\n" + payload.samples.map(formatSample).join("\n").replace(/[`\\]/g, "") + "\n```"
      : "",
    payload.dashboardUrl ? `[Ver en el dashboard](${payload.dashboardUrl})` : "",
  ].filter((bloque) => bloque !== "");

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.chatId,
      text: bloques.join("\n\n"),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detalle = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Telegram HTTP ${response.status}${detalle ? `: ${detalle}` : ""}`);
  }
};
