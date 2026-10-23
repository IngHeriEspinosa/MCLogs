import { sendMail } from "../../config/mailer";
import { renderEmail } from "../../utils/emailTemplate";
import { Notifier, alertTitle, formatSample } from "../types";

/** Configuración esperada en `AlertChannel.config` para el tipo `email`. */
export type EmailConfig = {
  to: string[];
};

export const sendEmail: Notifier = async (channel, payload) => {
  const settings = channel.config as unknown as EmailConfig;
  const destinatarios = settings?.to ?? [];
  if (destinatarios.length === 0) throw new Error("El canal de email no tiene destinatarios");

  const hallazgo =
    payload.rule.type === "new_error_group"
      ? payload.count === 1
        ? "ha detectado un error nuevo"
        : `ha detectado ${payload.count} errores nuevos`
      : `ha registrado ${payload.count} ${payload.count === 1 ? "coincidencia" : "coincidencias"}`;
  const umbral = payload.rule.type === "new_error_group" ? "" : ` (umbral: ${payload.threshold})`;
  // Los umbrales clásicos conservan su frase; el resto de tipos y la
  // recuperación usan el resumen de la condición.
  const classic = payload.kind !== "resolve" && (payload.rule.type === "threshold" || payload.rule.type === "new_error_group");
  const resumen = classic
    ? `La regla «${payload.rule.name}» ${hallazgo} en los últimos ${payload.windowMinutes} minutos${umbral}.`
    : payload.kind === "resolve"
      ? `La regla «${payload.rule.name}» se ha recuperado: ${payload.summary}.`
      : `La regla «${payload.rule.name}» se ha disparado: ${payload.summary}.`;

  const detalles = [
    { label: "Regla", value: payload.rule.name },
    { label: "Condición", value: payload.summary },
    payload.application ? { label: "Aplicación", value: payload.application } : null,
    payload.environment ? { label: "Entorno", value: payload.environment } : null,
    { label: "Nivel", value: payload.level },
  ].filter((detalle): detalle is { label: string; value: string } => detalle !== null);

  const { html, text } = renderEmail({
    locale: "es",
    preview: resumen,
    heading: payload.rule.name,
    paragraphs: [resumen],
    details: detalles,
    code: { title: "Últimos registros", lines: payload.samples.map(formatSample) },
    action: payload.dashboardUrl ? { label: "Ver en el dashboard", url: payload.dashboardUrl } : undefined,
    reason: "Recibes este aviso porque tu dirección figura en un canal de correo de las alertas de MCLog.",
  });

  await sendMail({
    to: destinatarios.join(", "),
    subject: alertTitle(payload),
    text,
    html,
  });
};
