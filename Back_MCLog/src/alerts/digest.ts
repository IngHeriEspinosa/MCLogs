import { createHmac } from "crypto";
import type { AlertChannel, DigestSchedule, Environment } from "@prisma/client";
import { config } from "../config/env";
import logger from "../config/logger";
import { alertDeliveries } from "../config/metrics";
import { sendMail } from "../config/mailer";
import { prisma } from "../config/prisma";
import { getErrorGroups } from "../services/analysisService";
import { lifecycleSummary } from "../services/errorGroupService";
import { renderEmail } from "../utils/emailTemplate";
import type { Delivery } from "./notifiers";
import { NOTIFIER_TIMEOUT_MS } from "./types";
import { WebhookConfig, detectWebhookFormat } from "./notifiers/webhook";
import type { TelegramConfig } from "./notifiers/telegram";
import type { EmailConfig } from "./notifiers/email";
import { PAGERDUTY_CHANGE_URL, PagerDutyConfig, isRoutingKey, postPagerDuty } from "./notifiers/pagerduty";

/**
 * Resumen programado: cada dia o cada semana, lo esencial del espacio por los
 * canales de alerta que se elijan. No sustituye a las alertas (que avisan al
 * momento) sino que responde a "¿como fue la semana?" sin abrir el panel.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TOP_GROUPS = 5;

export type Digest = {
  name: string;
  workspaceName: string;
  frequency: "daily" | "weekly";
  environment: Environment | null;
  from: string;
  to: string;
  totals: { total: number; error: number; warn: number };
  newGroups: number;
  regressions: number;
  resolved: number;
  mttrMs: number | null;
  topGroups: Array<{ fingerprint: string; application: string; errorName: string | null; message: string; count: number }>;
  dashboardUrl: string | null;
};

/** Reune las cifras del resumen de un espacio en su ventana (24 h o 7 dias hasta `now`). */
export const buildDigest = async (schedule: DigestSchedule & { workspace: { name: string } }, now = new Date()): Promise<Digest> => {
  const to = now;
  const from = new Date(now.getTime() - (schedule.frequency === "weekly" ? 7 * DAY_MS : DAY_MS));
  const scope = { workspaceId: schedule.workspaceId, ...(schedule.environment ? { environment: schedule.environment } : {}) };
  const [byLevel, groups, lifecycle] = await Promise.all([
    prisma.log.groupBy({ by: ["level"], where: { ...scope, timestamp: { gte: from, lte: to } }, _count: { _all: true } }),
    getErrorGroups({ ...scope, levels: ["error"], from, to }, TOP_GROUPS),
    lifecycleSummary(schedule.workspaceId, from, to),
  ]);
  const count = (level: string) => byLevel.find((row) => row.level === level)?._count._all ?? 0;
  const params = new URLSearchParams({ ws: String(schedule.workspaceId), from: from.toISOString(), to: to.toISOString() });
  return {
    name: schedule.name,
    workspaceName: schedule.workspace.name,
    frequency: schedule.frequency,
    environment: schedule.environment,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { total: byLevel.reduce((sum, row) => sum + row._count._all, 0), error: count("error"), warn: count("warn") },
    newGroups: lifecycle.newInWindow,
    regressions: lifecycle.regressedInWindow,
    resolved: lifecycle.resolvedInWindow,
    mttrMs: lifecycle.mttrMs,
    topGroups: groups.map((group) => ({
      fingerprint: group.fingerprint,
      application: group.application,
      errorName: group.errorName,
      message: group.sampleMessage.split("\n")[0].slice(0, 200),
      count: group.count,
    })),
    dashboardUrl: config.publicDashboardUrl ? `${config.publicDashboardUrl}/errors?${params.toString()}` : null,
  };
};

const formatDuration = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
};

export const digestTitle = (digest: Digest) =>
  `[MCLog] Resumen ${digest.frequency === "weekly" ? "semanal" : "diario"}: ${digest.workspaceName}${digest.environment ? ` (${digest.environment})` : ""}`;

/** Lineas de texto del resumen, comunes a todos los canales. */
export const digestLines = (digest: Digest): string[] => [
  `Registros: ${digest.totals.total} · errores: ${digest.totals.error} · warnings: ${digest.totals.warn}`,
  `Fallos nuevos: ${digest.newGroups} · regresiones: ${digest.regressions} · resueltos: ${digest.resolved}`,
  `Tiempo medio hasta resolver: ${digest.mttrMs === null ? "—" : formatDuration(digest.mttrMs)}`,
];

const topLines = (digest: Digest) =>
  digest.topGroups.map((group) => `${group.count}× ${group.application} · ${group.errorName ? `${group.errorName}: ` : ""}${group.message}`);

const postJson = async (url: string, body: unknown, secret?: string) => {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "MCLog" };
  if (secret) headers["x-mclog-signature"] = `sha256=${createHmac("sha256", secret).update(text).digest("hex")}`;
  const response = await fetch(url, { method: "POST", headers, body: text, signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
};

type DigestSender = (channel: AlertChannel, digest: Digest) => Promise<void>;

const sendDigestEmail: DigestSender = async (channel, digest) => {
  const to = (channel.config as unknown as EmailConfig)?.to ?? [];
  if (to.length === 0) throw new Error("El canal de email no tiene destinatarios");
  const { html, text } = renderEmail({
    locale: "es",
    preview: digestLines(digest)[0],
    heading: digestTitle(digest).replace("[MCLog] ", ""),
    paragraphs: digestLines(digest),
    code: digest.topGroups.length ? { title: "Fallos con más ocurrencias", lines: topLines(digest) } : undefined,
    action: digest.dashboardUrl ? { label: "Ver los errores", url: digest.dashboardUrl } : undefined,
    reason: "Recibes este resumen porque tu dirección figura en un canal de correo de MCLog con un resumen programado.",
  });
  await sendMail({ to: to.join(", "), subject: digestTitle(digest), text, html });
};

const sendDigestWebhook: DigestSender = async (channel, digest) => {
  const settings = channel.config as unknown as WebhookConfig;
  if (!settings?.url) throw new Error("El canal webhook no tiene URL configurada");
  const format = settings.format ?? detectWebhookFormat(settings.url);
  const lines = [...digestLines(digest), ...(digest.topGroups.length ? ["", ...topLines(digest)] : []), ...(digest.dashboardUrl ? [digest.dashboardUrl] : [])];
  const body =
    format === "slack"
      ? { text: digestTitle(digest), blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${digestTitle(digest)}*\n${lines.join("\n")}` } }] }
      : format === "discord"
        ? { content: digestTitle(digest), embeds: [{ description: lines.join("\n").slice(0, 4096) }] }
        : format === "teams"
          ? {
              type: "message",
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: {
                    type: "AdaptiveCard",
                    version: "1.4",
                    body: [
                      { type: "TextBlock", text: digestTitle(digest), weight: "Bolder", wrap: true },
                      ...lines.map((line) => ({ type: "TextBlock", text: line || " ", wrap: true })),
                    ],
                  },
                },
              ],
            }
          : { title: digestTitle(digest), digest };
  await postJson(settings.url, body, settings.secret);
};

const sendDigestTelegram: DigestSender = async (channel, digest) => {
  const settings = channel.config as unknown as TelegramConfig;
  if (!settings?.botToken || !settings?.chatId) throw new Error("El canal de Telegram necesita botToken y chatId");
  // Texto plano: el resumen no necesita formato y asi no hay que escapar MarkdownV2.
  const text = [digestTitle(digest), "", ...digestLines(digest), "", ...topLines(digest), digest.dashboardUrl ?? ""].join("\n").trim();
  await postJson(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, { chat_id: settings.chatId, text, disable_web_page_preview: true });
};

/**
 * En PagerDuty un resumen no es un incidente: va como change event, que queda
 * en la linea de tiempo del servicio sin despertar a nadie.
 */
const sendDigestPagerDuty: DigestSender = async (channel, digest) => {
  const settings = channel.config as unknown as PagerDutyConfig;
  if (!isRoutingKey(settings?.routingKey)) throw new Error("El canal de PagerDuty necesita una routingKey válida");
  await postPagerDuty(PAGERDUTY_CHANGE_URL, {
    routing_key: settings.routingKey,
    payload: {
      summary: digestTitle(digest).slice(0, 1024),
      source: "mclog",
      timestamp: new Date().toISOString(),
      custom_details: { lines: digestLines(digest), topGroups: topLines(digest) },
    },
    ...(digest.dashboardUrl ? { links: [{ href: digest.dashboardUrl, text: "Ver en MCLog" }] } : {}),
  });
};

/** Envio por tipo de canal, sustituible en los tests como `notifiers`. */
export const digestSenders: Record<AlertChannel["type"], DigestSender> = {
  email: sendDigestEmail,
  webhook: sendDigestWebhook,
  telegram: sendDigestTelegram,
  pagerduty: sendDigestPagerDuty,
};

/** Envia un resumen por sus canales activos. Nunca lanza: devuelve el resultado de cada uno. */
export const deliverDigest = async (channels: AlertChannel[], digest: Digest): Promise<Delivery[]> =>
  Promise.all(
    channels
      .filter((channel) => channel.enabled)
      .map(async (channel): Promise<Delivery> => {
        const base = { channelId: channel.id, channelName: channel.name };
        try {
          await digestSenders[channel.type](channel, digest);
          alertDeliveries.inc({ channel_type: channel.type, kind: "digest", result: "ok" });
          return { ...base, ok: true };
        } catch (error) {
          alertDeliveries.inc({ channel_type: channel.type, kind: "digest", result: "failed" });
          const detalle = error instanceof Error ? error.message : String(error);
          logger.error("Digest delivery failed", { channelId: channel.id, digest: digest.name, error: detalle });
          return { ...base, ok: false, error: detalle };
        }
      }),
  );

/** Si un resumen toca en esta hora (UTC) y no ha salido ya en ella. */
export const isDigestDue = (schedule: Pick<DigestSchedule, "frequency" | "hourUtc" | "weekday" | "lastSentAt">, now: Date) => {
  if (now.getUTCHours() !== schedule.hourUtc) return false;
  if (schedule.frequency === "weekly" && now.getUTCDay() !== schedule.weekday) return false;
  const hourStart = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  return !schedule.lastSentAt || schedule.lastSentAt.getTime() < hourStart;
};

/** Envia los resumenes que tocan ahora. La llama el planificador cada pocos minutos. */
export const runDigestsNow = async (now = new Date()): Promise<number> => {
  const schedules = await prisma.digestSchedule.findMany({
    where: { enabled: true, workspace: { deletedAt: null } },
    include: { channels: true, workspace: { select: { name: true } } },
  });
  let sent = 0;
  for (const schedule of schedules.filter((candidate) => isDigestDue(candidate, now))) {
    try {
      const deliveries = await deliverDigest(schedule.channels, await buildDigest(schedule, now));
      // Se marca aunque falle algun canal: reintentar cada pocos minutos durante
      // una hora mandaria el mismo resumen varias veces a los que si funcionan.
      await prisma.digestSchedule.update({ where: { id: schedule.id }, data: { lastSentAt: now } });
      sent += 1;
      logger.info("Digest sent", { digest: schedule.name, channels: deliveries.length, failed: deliveries.filter((d) => !d.ok).length });
    } catch (error) {
      logger.error("Digest failed", { digest: schedule.name, error: String(error) });
    }
  }
  return sent;
};
