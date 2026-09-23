import { createHash, randomBytes } from "crypto";
import { config } from "../config/env";
import { isMailConfigured, sendMail } from "../config/mailer";
import { prisma } from "../config/prisma";
import { UserServiceError, hashPassword, revokeSessions } from "./userService";

/**
 * "Olvide mi contrasena": un enlace de un solo uso enviado al correo de la cuenta.
 *
 * El token viaja solo en el enlace; en base de datos queda su sha256, asi que
 * quien lea la tabla no puede usar un enlace pendiente. Caduca pronto, pedir
 * otro invalida el anterior y usarlo cierra todas las sesiones de la cuenta.
 */

export const RESET_LOCALES = ["es", "en"] as const;
export type ResetLocale = (typeof RESET_LOCALES)[number];

const MINUTE_MS = 60_000;
/** Un correo por cuenta y minuto como mucho: pedirlo en bucle no llena el buzon de nadie. */
const RESEND_COOLDOWN_MS = MINUTE_MS;

const INVALID_LINK = "Invalid or expired reset link";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Hace falta SMTP para enviar el correo y la URL publica del dashboard para el
 * enlace. La URL sale siempre de la configuracion, nunca de la peticion: con
 * la cabecera Host u Origin, cualquiera podria hacer que el correo apuntase a
 * su dominio y quedarse con el token cuando la victima lo pulsara.
 */
export const isPasswordResetAvailable = () => isMailConfigured() && config.publicDashboardUrl !== "";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COPY: Record<ResetLocale, (minutes: number) => { subject: string; intro: string; action: string; expiry: string; ignore: string }> = {
  es: (minutes) => ({
    subject: "Restablece tu contraseña de MCLog",
    intro: "Alguien ha pedido restablecer la contraseña de tu cuenta de MCLog. Para elegir una nueva, abre este enlace:",
    action: "Elegir una contraseña nueva",
    expiry: `El enlace caduca en ${minutes} minutos y solo sirve una vez. Al usarlo se cerrarán todas tus sesiones abiertas.`,
    ignore: "Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará.",
  }),
  en: (minutes) => ({
    subject: "Reset your MCLog password",
    intro: "Someone asked to reset the password of your MCLog account. To choose a new one, open this link:",
    action: "Choose a new password",
    expiry: `The link expires in ${minutes} minutes and works only once. Using it will sign you out of every open session.`,
    ignore: "If you didn't ask for this, ignore this email: your password won't change.",
  }),
};

export const buildResetEmail = (link: string, locale: ResetLocale) => {
  const copy = COPY[locale](config.passwordResetTtlMinutes);
  const text = [copy.intro, "", link, "", copy.expiry, copy.ignore].join("\n");
  const html = [
    `<p style="font:14px system-ui,sans-serif;color:#334155">${escapeHtml(copy.intro)}</p>`,
    `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#19607e;color:#fff;font:600 14px system-ui,sans-serif;text-decoration:none">${escapeHtml(copy.action)}</a></p>`,
    `<p style="font:12px ui-monospace,monospace;color:#64748b;word-break:break-all">${escapeHtml(link)}</p>`,
    `<p style="font:13px system-ui,sans-serif;color:#64748b">${escapeHtml(copy.expiry)}<br>${escapeHtml(copy.ignore)}</p>`,
  ].join("");
  return { subject: copy.subject, text, html };
};

/**
 * Envia el enlace si el correo corresponde a una cuenta. Si no, no hace nada:
 * quien llama responde lo mismo en ambos casos para no revelar que cuentas
 * existen.
 */
export const requestPasswordReset = async (email: string, locale: ResetLocale): Promise<void> => {
  // Sin distinguir mayusculas: nadie recuerda como escribio su correo al darse de alta.
  const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } } });
  if (!user) return;

  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
  });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  // Solo vale el ultimo enlace: pedir otro invalida los anteriores.
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + config.passwordResetTtlMinutes * MINUTE_MS),
      },
    }),
  ]);

  const link = `${config.publicDashboardUrl}/reset-password?token=${token}`;
  await sendMail({ to: user.email, ...buildResetEmail(link, locale) });
};

/** Cambia la contrasena con un enlace valido. Devuelve el id de la cuenta. */
export const resetPassword = async (token: string, newPassword: string): Promise<number> => {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.expiresAt <= new Date()) throw new UserServiceError(INVALID_LINK, 400);

  // Se consume antes de tocar la contrasena: si llegan dos peticiones a la vez
  // con el mismo enlace, solo una borra la fila y sigue adelante.
  const { count } = await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
  if (count === 0) throw new UserServiceError(INVALID_LINK, 400);

  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });
  // Quien tuviera la contrasena vieja pierde la sesion que hubiera abierto con ella.
  await revokeSessions(record.userId);
  return record.userId;
};
