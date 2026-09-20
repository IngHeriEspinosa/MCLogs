import nodemailer, { Transporter } from "nodemailer";
import { config } from "../../config/env";
import { NOTIFIER_TIMEOUT_MS, Notifier, alertTitle, formatSample } from "../types";

/** Configuración esperada en `AlertChannel.config` para el tipo `email`. */
export type EmailConfig = {
  to: string[];
};

/**
 * Transporte SMTP, creado una sola vez y reutilizado: abrir una conexión por
 * aviso sería lento y poco amable con el servidor de correo.
 */
let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (transporter) return transporter;
  if (!config.smtp.host) {
    throw new Error("SMTP no configurado: define SMTP_HOST (y SMTP_PORT, SMTP_USER, SMTP_PASS si hacen falta)");
  }

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}),
    connectionTimeout: NOTIFIER_TIMEOUT_MS,
    greetingTimeout: NOTIFIER_TIMEOUT_MS,
    socketTimeout: NOTIFIER_TIMEOUT_MS,
  });
  return transporter;
};

/** Solo para tests: fuerza a reconstruir el transporte en el próximo envío. */
export const resetEmailTransport = () => {
  transporter = null;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const sendEmail: Notifier = async (channel, payload) => {
  const settings = channel.config as unknown as EmailConfig;
  const destinatarios = settings?.to ?? [];
  if (destinatarios.length === 0) throw new Error("El canal de email no tiene destinatarios");

  const titulo = alertTitle(payload);
  const cabecera = [
    `Regla: ${payload.rule.name}`,
    `Coincidencias: ${payload.count} (umbral ${payload.threshold} en ${payload.windowMinutes} min)`,
    payload.application ? `Aplicación: ${payload.application}` : null,
    payload.environment ? `Entorno: ${payload.environment}` : null,
    `Nivel: ${payload.level}`,
  ].filter(Boolean) as string[];

  const lineas = payload.samples.map(formatSample);

  const texto = [
    ...cabecera,
    "",
    lineas.length > 0 ? "Últimos registros:" : "",
    ...lineas,
    "",
    payload.dashboardUrl ? `Ver en el dashboard: ${payload.dashboardUrl}` : "",
  ]
    .filter((linea) => linea !== "")
    .join("\n");

  const html = [
    `<h2 style="margin:0 0 12px;font:600 16px system-ui,sans-serif">${escapeHtml(titulo)}</h2>`,
    `<ul style="font:14px system-ui,sans-serif;color:#334155">`,
    ...cabecera.map((linea) => `<li>${escapeHtml(linea)}</li>`),
    `</ul>`,
    lineas.length > 0
      ? `<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font:12px ui-monospace,monospace;overflow:auto">${lineas
          .map(escapeHtml)
          .join("\n")}</pre>`
      : "",
    payload.dashboardUrl
      ? `<p style="font:14px system-ui,sans-serif"><a href="${escapeHtml(payload.dashboardUrl)}">Ver en el dashboard</a></p>`
      : "",
  ].join("");

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: destinatarios.join(", "),
    subject: titulo,
    text: texto,
    html,
  });
};
