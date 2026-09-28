import { createHash, randomBytes } from "crypto";
import { config } from "../config/env";
import logger from "../config/logger";
import { isMailConfigured, sendMail } from "../config/mailer";
import { prisma } from "../config/prisma";
import { renderEmail } from "../utils/emailTemplate";
import { UserServiceError, hashPassword, revokeSessions } from "./userService";
import { getSetting } from "./settingsService";

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

type ActionEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  paragraphs: string[];
  action: string;
  notes: string[];
  reason: string;
};

const buildActionEmail = (copy: ActionEmailCopy, link: string, locale: ResetLocale) => ({
  subject: copy.subject,
  ...renderEmail({
    locale,
    preview: copy.preview,
    heading: copy.heading,
    paragraphs: copy.paragraphs,
    action: { label: copy.action, url: link },
    notes: copy.notes,
    reason: copy.reason,
  }),
});

const COPY: Record<ResetLocale, (minutes: number) => ActionEmailCopy> = {
  es: (minutes) => ({
    subject: "Restablece tu contraseña de MCLog",
    preview: `Elige una contraseña nueva. El enlace caduca en ${minutes} minutos.`,
    heading: "Restablece tu contraseña",
    paragraphs: ["Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de MCLog. Para elegir una nueva, pulsa el botón:"],
    action: "Elegir una contraseña nueva",
    notes: [
      `El enlace caduca en ${minutes} minutos y solo sirve una vez. Al usarlo se cerrarán todas tus sesiones abiertas.`,
      "Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará.",
    ],
    reason: "Recibes este correo porque se pidió restablecer la contraseña de la cuenta de MCLog asociada a esta dirección.",
  }),
  en: (minutes) => ({
    subject: "Reset your MCLog password",
    preview: `Choose a new password. The link expires in ${minutes} minutes.`,
    heading: "Reset your password",
    paragraphs: ["We received a request to reset the password of your MCLog account. To choose a new one, click the button:"],
    action: "Choose a new password",
    notes: [
      `The link expires in ${minutes} minutes and works only once. Using it will sign you out of every open session.`,
      "If you didn't ask for this, ignore this email: your password won't change.",
    ],
    reason: "You're receiving this email because a password reset was requested for the MCLog account linked to this address.",
  }),
};

export const buildResetEmail = (link: string, locale: ResetLocale) =>
  buildActionEmail(COPY[locale](getSetting("passwordResetTtlMinutes")), link, locale);

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
        expiresAt: new Date(Date.now() + getSetting("passwordResetTtlMinutes") * MINUTE_MS),
      },
    }),
  ]);

  const link = `${config.publicDashboardUrl}/reset-password?token=${token}`;
  await sendMail({ to: user.email, ...buildResetEmail(link, locale) });
};

// --- Invitaciones ---

/**
 * Una invitacion vale mas que un restablecimiento (una semana por defecto,
 * configurable): quien la recibe no siempre la abre el mismo dia, y el enlace
 * solo sirve para esa cuenta pendiente.
 */
const DAY_MS = 24 * 60 * MINUTE_MS;

/** "1 dia", "7 dias": la caducidad de una invitacion puede quedar en un solo dia. */
const DAYS: Record<ResetLocale, (days: number) => string> = {
  es: (days) => `${days} ${days === 1 ? "día" : "días"}`,
  en: (days) => `${days} ${days === 1 ? "day" : "days"}`,
};

const INVITE_COPY: Record<ResetLocale, (workspace: string, days: number) => ActionEmailCopy> = {
  es: (workspace, days) => ({
    subject: `Te han invitado a «${workspace}» en MCLog`,
    preview: `Activa tu cuenta para entrar en «${workspace}».`,
    heading: "Te han invitado a MCLog",
    paragraphs: [
      `Te han invitado al espacio «${workspace}» de MCLog, la plataforma donde se centralizan los logs de sus aplicaciones.`,
      "Para activar tu cuenta, elige tu contraseña:",
    ],
    action: "Activar mi cuenta",
    notes: [`El enlace caduca en ${DAYS.es(days)} y solo sirve una vez.`],
    reason: "Recibes este correo porque te han invitado a MCLog con esta dirección. Si no esperabas la invitación, puedes ignorarlo.",
  }),
  en: (workspace, days) => ({
    subject: `You've been invited to "${workspace}" on MCLog`,
    preview: `Activate your account to join "${workspace}".`,
    heading: "You've been invited to MCLog",
    paragraphs: [
      `You've been invited to the "${workspace}" workspace on MCLog, the platform where its applications' logs are centralized.`,
      "To activate your account, choose your password:",
    ],
    action: "Activate my account",
    notes: [`The link expires in ${DAYS.en(days)} and works only once.`],
    reason: "You're receiving this email because you were invited to MCLog with this address. If you weren't expecting it, you can ignore it.",
  }),
};

export const buildInvitationEmail = (workspace: string, days: number, link: string, locale: ResetLocale) =>
  buildActionEmail(INVITE_COPY[locale](workspace, days), link, locale);

const NOTICE_COPY: Record<ResetLocale, (workspace: string) => ActionEmailCopy> = {
  es: (workspace) => ({
    subject: `Ahora tienes acceso a «${workspace}» en MCLog`,
    preview: `Ya puedes entrar en «${workspace}».`,
    heading: "Tienes acceso a un espacio nuevo",
    paragraphs: [`Te han agregado al espacio «${workspace}» de MCLog. Lo encontrarás en el selector de espacios del panel.`],
    action: "Abrir MCLog",
    notes: [],
    reason: "Recibes este correo porque tienes una cuenta de MCLog con esta dirección.",
  }),
  en: (workspace) => ({
    subject: `You now have access to "${workspace}" on MCLog`,
    preview: `You can now open "${workspace}".`,
    heading: "You have access to a new workspace",
    paragraphs: [`You've been added to the "${workspace}" workspace on MCLog. You'll find it in the workspace switcher.`],
    action: "Open MCLog",
    notes: [],
    reason: "You're receiving this email because you have an MCLog account with this address.",
  }),
};

/**
 * Genera el enlace de activacion de una cuenta invitada. Como el de "olvide mi
 * contrasena", en base de datos solo queda el hash y generar otro invalida el
 * anterior. Devuelve la ruta relativa: el correo la completa con la URL
 * publica, y quien invita sin correo la completa con la del panel que usa.
 */
export const issueInvitationPath = async (userId: number): Promise<string> => {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + getSetting("invitationTtlDays") * DAY_MS) },
    }),
  ]);
  return `/reset-password?token=${token}&invite=1`;
};

/**
 * Envia la invitacion por correo si se puede. Si no hay SMTP o el envio falla,
 * `emailSent` es false y quien invita recibe la ruta para compartirla.
 */
export const sendInvitation = async (
  user: { id: number; email: string },
  workspaceName: string,
  locale: ResetLocale,
): Promise<{ emailSent: boolean; path: string }> => {
  const path = await issueInvitationPath(user.id);
  if (!isPasswordResetAvailable()) return { emailSent: false, path };

  const link = `${config.publicDashboardUrl}${path}`;
  try {
    await sendMail({ to: user.email, ...buildInvitationEmail(workspaceName, getSetting("invitationTtlDays"), link, locale) });
    return { emailSent: true, path };
  } catch (error) {
    logger.error("Invitation email failed", { error: String(error) });
    return { emailSent: false, path };
  }
};

/** Avisa a una cuenta ya activa de que tiene acceso a un espacio nuevo. No falla nunca. */
export const sendMembershipNotice = async (email: string, workspaceName: string, locale: ResetLocale): Promise<boolean> => {
  if (!isPasswordResetAvailable()) return false;
  const copy = NOTICE_COPY[locale](workspaceName);
  try {
    await sendMail({ to: email, ...buildActionEmail(copy, config.publicDashboardUrl, locale) });
    return true;
  } catch (error) {
    logger.error("Membership notice email failed", { error: String(error) });
    return false;
  }
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
  // Si era una invitacion, elegir la contrasena es lo que activa la cuenta.
  await prisma.user.updateMany({ where: { id: record.userId, activatedAt: null }, data: { activatedAt: new Date() } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });
  // Quien tuviera la contrasena vieja pierde la sesion que hubiera abierto con ella.
  await revokeSessions(record.userId);
  return record.userId;
};
