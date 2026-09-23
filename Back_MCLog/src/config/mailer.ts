import nodemailer, { Transporter } from "nodemailer";
import { config } from "./env";

/** Tope de cada fase de la conexion SMTP: un servidor que no responde no debe colgar a nadie. */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Transporte SMTP compartido por los avisos de alertas y los correos de la
 * cuenta. Se crea una sola vez y se reutiliza: abrir una conexion por correo
 * seria lento y poco amable con el servidor.
 */
let transporter: Transporter | null = null;

export const isMailConfigured = () => config.smtp.host !== "";

export const getTransporter = (): Transporter => {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error("SMTP no configurado: define SMTP_HOST (y SMTP_PORT, SMTP_USER, SMTP_PASS si hacen falta)");
  }

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}),
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  return transporter;
};

/** Solo para tests: fuerza a reconstruir el transporte en el proximo envio. */
export const resetEmailTransport = () => {
  transporter = null;
};

export const sendMail = (message: { to: string; subject: string; text: string; html: string }) =>
  getTransporter().sendMail({ from: config.smtp.from, ...message });
