import type { SendMailOptions } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { z } from "zod";

/**
 * Envio de correo por Microsoft Graph (`POST /users/{buzon}/sendMail`).
 *
 * Existe para cuando SMTP no es una opcion: hay proveedores, como DigitalOcean,
 * que bloquean la salida por los puertos 25, 465 y 587, y Exchange Online va
 * retirando el SMTP AUTH con usuario y contrasena. Graph va por HTTPS y se
 * autentica con OAuth 2.0 (client credentials) con una app de Entra ID.
 *
 * El mensaje se compone en MIME con nodemailer, igual que por SMTP: llega con
 * la misma parte de texto y la misma de HTML. Se envia desde el buzon cuya
 * direccion figura en el remitente.
 */

const LOGIN_URL = "https://login.microsoftonline.com";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
/** El token se renueva un minuto antes de caducar, para no llegar a Graph con uno vencido. */
const TOKEN_RENEWAL_MARGIN_MS = 60_000;
/** Los errores de Entra ID arrastran trazas e identificadores de correlacion: basta con el principio. */
const ERROR_DETAIL_MAX_LENGTH = 300;

export type GraphCredentials = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

/** Lo unico que envia MCLog: remitente, destinatarios (separados por comas), asunto y cuerpo en texto y HTML. */
export type OutgoingMail = Pick<SendMailOptions, "from" | "to" | "subject" | "text" | "html">;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

// Entra ID responde { error, error_description }; Graph, { error: { code, message } }.
const errorResponseSchema = z.object({
  error: z.union([z.string(), z.object({ code: z.string(), message: z.string() })]),
  error_description: z.string().optional(),
});

/** Resume una respuesta de error de Microsoft en una linea legible. Nunca incluye credenciales: no viajan en la respuesta. */
const describeFailure = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => "");
  let detail = body;
  try {
    const parsed = errorResponseSchema.safeParse(JSON.parse(body));
    if (parsed.success) {
      const { error, error_description } = parsed.data;
      detail =
        typeof error === "string"
          ? [error, error_description].filter(Boolean).join(": ")
          : `${error.code}: ${error.message}`;
    }
  } catch {
    // No era JSON: se queda el texto tal cual.
  }
  detail = detail.trim().slice(0, ERROR_DETAIL_MAX_LENGTH);
  return `HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
};

/**
 * Crea la funcion de envio. Guarda el token de acceso en memoria y lo reutiliza
 * hasta poco antes de que caduque (Entra ID los emite por una hora).
 */
export const createGraphMailSender = (credentials: GraphCredentials, timeoutMs: number) => {
  let token: { value: string; expiresAt: number } | null = null;

  const getAccessToken = async (): Promise<string> => {
    if (token && Date.now() < token.expiresAt) return token.value;

    const response = await fetch(`${LOGIN_URL}/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: GRAPH_SCOPE,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Microsoft Entra ID no entregó el token (${await describeFailure(response)})`);
    }

    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error("Microsoft Entra ID respondió sin un token de acceso válido");

    token = {
      value: parsed.data.access_token,
      expiresAt: Date.now() + parsed.data.expires_in * 1000 - TOKEN_RENEWAL_MARGIN_MS,
    };
    return token.value;
  };

  return async (message: OutgoingMail): Promise<void> => {
    const mime = new MailComposer(message).compile();
    const { from } = mime.getEnvelope();
    if (!from) throw new Error("El correo no tiene remitente: SMTP_FROM debe llevar la dirección del buzón que envía");

    const raw = await mime.build();
    const accessToken = await getAccessToken();
    const response = await fetch(`${GRAPH_URL}/users/${encodeURIComponent(from)}/sendMail`, {
      method: "POST",
      // Con el cuerpo en MIME, Graph lo espera en base64 y como text/plain.
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "text/plain" },
      body: raw.toString("base64"),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // Un 401 con el token aun vigente es que lo han revocado o que se roto el
      // secreto: el proximo envio pedira otro en lugar de repetir el mismo fallo.
      if (response.status === 401) token = null;
      throw new Error(`Microsoft Graph rechazó el correo (${await describeFailure(response)})`);
    }
  };
};
