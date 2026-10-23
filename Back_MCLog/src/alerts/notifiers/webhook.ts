import { createHmac } from "crypto";
import { AlertPayload, NOTIFIER_TIMEOUT_MS, Notifier, alertTitle, formatSample } from "../types";

/**
 * Forma del cuerpo. Slack, Discord y Teams rechazan un JSON que no sea el
 * suyo (Slack exige `text`, Discord `content` o `embeds`, Teams una tarjeta),
 * así que pegar su URL en un canal genérico no funcionaba aunque la
 * documentación lo prometiera. `generic` es el aviso tal cual, para n8n, Make
 * o un receptor propio.
 */
export const WEBHOOK_FORMATS = ["generic", "slack", "discord", "teams"] as const;
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

/** Configuración esperada en `AlertChannel.config` para el tipo `webhook`. */
export type WebhookConfig = {
  url: string;
  /**
   * Si está presente, se firma el cuerpo con HMAC-SHA256 y se envía en la
   * cabecera `x-mclog-signature`. Permite al receptor comprobar que el aviso
   * viene de MCLog y no de cualquiera que conozca la URL.
   */
  secret?: string;
  /** Sin él, se deduce de la URL (ver `detectWebhookFormat`). */
  format?: WebhookFormat;
};

/** Formato que corresponde a la URL de un webhook de Slack, Discord o Teams; si no, `generic`. */
export const detectWebhookFormat = (url: string): WebhookFormat => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "generic";
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "hooks.slack.com") return "slack";
  if ((host === "discord.com" || host === "discordapp.com") && parsed.pathname.startsWith("/api/webhooks/")) {
    return "discord";
  }
  // Conectores de Office 365 y flujos de Power Automate (los "Workflows" de Teams).
  if (
    host.endsWith(".webhook.office.com") ||
    host.endsWith(".logic.azure.com") ||
    host.endsWith(".api.powerplatform.com")
  ) {
    return "teams";
  }
  return "generic";
};

/** Líneas de contexto del aviso, compartidas por los formatos con texto. */
const detailLines = (payload: AlertPayload): string[] =>
  [
    payload.rule.type === "new_error_group"
      ? `Grupos nuevos: ${payload.count} en ${payload.windowMinutes} min`
      : `Coincidencias: ${payload.count} (umbral ${payload.threshold} en ${payload.windowMinutes} min)`,
    payload.application ? `Aplicación: ${payload.application}` : null,
    payload.environment ? `Entorno: ${payload.environment}` : null,
    `Nivel: ${payload.level}`,
  ].filter((line): line is string => line !== null);

/** Recorta a `max` caracteres: cada plataforma tiene sus topes por campo. */
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** Slack exige escapar estos tres caracteres en mrkdwn; el resto se muestra tal cual. */
const escapeSlack = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Las comillas invertidas cerrarían el bloque de código antes de tiempo. */
const codeBlock = (lines: string[]) => "```\n" + lines.join("\n").replace(/`/g, "'") + "\n```";

const slackBody = (payload: AlertPayload) => {
  const title = alertTitle(payload);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: clip(title, 150) } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(detailLines(payload).join("\n")) } },
  ];
  if (payload.samples.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: clip(codeBlock(payload.samples.map((sample) => escapeSlack(formatSample(sample)))), 3000) },
    });
  }
  if (payload.dashboardUrl) {
    blocks.push({
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: "Ver en el dashboard" }, url: payload.dashboardUrl }],
    });
  }
  // `text` es lo que se ve en la notificación y en los clientes sin bloques.
  return { text: title, blocks };
};

const discordBody = (payload: AlertPayload) => {
  const description = [
    detailLines(payload).join("\n"),
    payload.samples.length > 0 ? codeBlock(payload.samples.map(formatSample)) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    content: clip(alertTitle(payload), 2000),
    embeds: [
      {
        title: clip(payload.rule.name, 256),
        description: clip(description, 4096),
        ...(payload.dashboardUrl ? { url: payload.dashboardUrl } : {}),
        // Rojo para errores, ámbar para el resto: el mismo código de color del panel.
        color: payload.level === "error" ? 0xd93025 : 0xf29900,
        timestamp: payload.triggeredAt,
      },
    ],
  };
};

const teamsBody = (payload: AlertPayload) => ({
  type: "message",
  attachments: [
    {
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", text: alertTitle(payload), weight: "Bolder", size: "Medium", wrap: true },
          {
            type: "FactSet",
            facts: detailLines(payload).map((line) => {
              const [title, ...rest] = line.split(": ");
              return { title, value: rest.join(": ") };
            }),
          },
          ...payload.samples.map((sample) => ({
            type: "TextBlock",
            text: formatSample(sample),
            fontType: "Monospace",
            size: "Small",
            wrap: true,
          })),
        ],
        ...(payload.dashboardUrl
          ? { actions: [{ type: "Action.OpenUrl", title: "Ver en el dashboard", url: payload.dashboardUrl }] }
          : {}),
      },
    },
  ],
});

/** Cuerpo del aviso en el formato de destino. */
export const buildWebhookBody = (format: WebhookFormat, payload: AlertPayload): unknown => {
  switch (format) {
    case "slack":
      return slackBody(payload);
    case "discord":
      return discordBody(payload);
    case "teams":
      return teamsBody(payload);
    default:
      return { title: alertTitle(payload), ...payload };
  }
};

export const sendWebhook: Notifier = async (channel, payload) => {
  const config = channel.config as unknown as WebhookConfig;
  if (!config?.url) throw new Error("El canal webhook no tiene URL configurada");

  const format = config.format ?? detectWebhookFormat(config.url);
  const body = JSON.stringify(buildWebhookBody(format, payload));

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
