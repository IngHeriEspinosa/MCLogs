import nodemailer from "nodemailer";
import { config } from "./env";
import { OutgoingMail, createGraphMailSender } from "./graphMailer";

/** Tope de cada fase del envio: un servidor que no responde no debe colgar a nadie. */
const MAIL_TIMEOUT_MS = 10_000;

type MailSender = (message: OutgoingMail) => Promise<void>;

/**
 * Envio compartido por los avisos de alertas y los correos de la cuenta, por
 * SMTP o por Microsoft Graph segun MAIL_TRANSPORT. Se crea una sola vez y se
 * reutiliza: por SMTP, abrir una conexion por correo seria lento y poco amable
 * con el servidor; por Graph, conserva el token de acceso entre envios.
 */
let sender: MailSender | null = null;

const isGraphConfigured = () =>
  config.graph.tenantId !== "" && config.graph.clientId !== "" && config.graph.clientSecret !== "";

export const isMailConfigured = () => (config.mailTransport === "graph" ? isGraphConfigured() : config.smtp.host !== "");

const createSmtpSender = (): MailSender => {
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}),
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
  });
  return async (message) => {
    await transporter.sendMail(message);
  };
};

const getSender = (): MailSender => {
  if (sender) return sender;
  if (!isMailConfigured()) {
    throw new Error(
      config.mailTransport === "graph"
        ? "Microsoft Graph no configurado: define MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID y MS_GRAPH_CLIENT_SECRET"
        : "SMTP no configurado: define SMTP_HOST (y SMTP_PORT, SMTP_USER, SMTP_PASS si hacen falta)",
    );
  }

  sender = config.mailTransport === "graph" ? createGraphMailSender(config.graph, MAIL_TIMEOUT_MS) : createSmtpSender();
  return sender;
};

/** Solo para tests: fuerza a reconstruir el transporte en el proximo envio. */
export const resetEmailTransport = () => {
  sender = null;
};

export const sendMail = async (message: { to: string; subject: string; text: string; html: string }) =>
  getSender()({ from: config.smtp.from, ...message });
