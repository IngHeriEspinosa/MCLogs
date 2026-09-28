/**
 * Plantilla comun de todos los correos de MCLog: invitaciones, accesos,
 * restablecimiento de contrasena y alertas.
 *
 * Los clientes de correo (Gmail, Outlook) ignoran las hojas de estilo y buena
 * parte del CSS moderno, asi que el HTML va con tablas y estilos en linea: es
 * la unica forma de que se vea igual en todos. Cada correo sale tambien en
 * texto plano, con el mismo contenido.
 */

export type EmailLocale = "es" | "en";

export type EmailContent = {
  locale: EmailLocale;
  /** Lo que el buzon muestra junto al asunto antes de abrir el correo. */
  preview: string;
  heading: string;
  paragraphs: string[];
  /** Pares etiqueta/valor, como los datos de una alerta. */
  details?: Array<{ label: string; value: string }>;
  /** Bloque monoespaciado, como las muestras de una alerta. */
  code?: { title: string; lines: string[] };
  action?: { label: string; url: string };
  /** Letra pequena bajo el boton: caducidad, que hacer si no lo pidio. */
  notes?: string[];
  /** Por que le llega este correo a quien lo recibe. */
  reason: string;
};

// Colores de la marca (los del icono del dashboard) y neutros con contraste AA sobre su fondo.
const COLOR = {
  canvas: "#eef2f4",
  header: "#0b1a21",
  brand: "#19607e",
  accent: "#ebae23",
  card: "#ffffff",
  footer: "#f7f9fa",
  border: "#e3e9ec",
  heading: "#0f2027",
  body: "#33434a",
  muted: "#56666e",
  onDark: "#ffffff",
  onDarkMuted: "#9fb6bf",
  codeBg: "#f5f8f9",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const LABELS: Record<EmailLocale, { tagline: string; fallback: string; automated: string }> = {
  es: {
    tagline: "Logs centralizados",
    fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
    automated: "Mensaje automático de MCLog. Este buzón no recibe respuestas.",
  },
  en: {
    tagline: "Centralized logs",
    fallback: "If the button doesn't work, paste this link into your browser:",
    automated: "Automated message from MCLog. This mailbox doesn't receive replies.",
  },
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const paragraph = (value: string, style: string) => `<p style="${style}">${escapeHtml(value)}</p>`;

const detailsHtml = (details: NonNullable<EmailContent["details"]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:collapse">${details
    .map(
      ({ label, value }) =>
        `<tr>` +
        `<td style="padding:10px 12px 10px 0;border-top:1px solid ${COLOR.border};font:400 13px/1.5 ${FONT};color:${COLOR.muted};width:38%;vertical-align:top">${escapeHtml(label)}</td>` +
        `<td style="padding:10px 0;border-top:1px solid ${COLOR.border};font:600 14px/1.5 ${FONT};color:${COLOR.heading};vertical-align:top;word-break:break-word">${escapeHtml(value)}</td>` +
        `</tr>`,
    )
    .join("")}</table>`;

const codeHtml = ({ title, lines }: NonNullable<EmailContent["code"]>) =>
  paragraph(title, `margin:0 0 8px;font:600 13px/1.5 ${FONT};color:${COLOR.heading}`) +
  `<pre style="margin:0 0 24px;padding:14px 16px;background:${COLOR.codeBg};border:1px solid ${COLOR.border};border-radius:8px;font:400 12px/1.6 ${MONO};color:${COLOR.body};white-space:pre-wrap;word-break:break-word">${lines
    .map(escapeHtml)
    .join("\n")}</pre>`;

// Boton "a prueba de balas": la celda lleva el color para que Outlook, que no
// pinta el fondo de un enlace, lo muestre igual.
const buttonHtml = ({ label, url }: NonNullable<EmailContent["action"]>) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px"><tr>` +
  `<td style="border-radius:8px;background:${COLOR.brand}">` +
  `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;border-radius:8px;font:600 15px/1 ${FONT};color:${COLOR.onDark};text-decoration:none">${escapeHtml(label)}</a>` +
  `</td></tr></table>`;

const fallbackHtml = (url: string, locale: EmailLocale) =>
  `<div style="margin-top:28px;padding-top:20px;border-top:1px solid ${COLOR.border}">` +
  paragraph(LABELS[locale].fallback, `margin:0 0 6px;font:400 12px/1.5 ${FONT};color:${COLOR.muted}`) +
  `<p style="margin:0;font:400 12px/1.5 ${MONO};word-break:break-all"><a href="${escapeHtml(url)}" style="color:${COLOR.brand};text-decoration:underline">${escapeHtml(url)}</a></p>` +
  `</div>`;

const renderHtml = (content: EmailContent): string => {
  const labels = LABELS[content.locale];
  const body = [
    `<h1 style="margin:0 0 16px;font:600 22px/1.35 ${FONT};color:${COLOR.heading}">${escapeHtml(content.heading)}</h1>`,
    ...content.paragraphs.map((value) => paragraph(value, `margin:0 0 16px;font:400 15px/1.6 ${FONT};color:${COLOR.body}`)),
    content.details?.length ? detailsHtml(content.details) : "",
    content.code?.lines.length ? codeHtml(content.code) : "",
    content.action ? buttonHtml(content.action) : "",
    ...(content.notes ?? []).map((value) => paragraph(value, `margin:0 0 8px;font:400 13px/1.55 ${FONT};color:${COLOR.muted}`)),
    content.action ? fallbackHtml(content.action.url, content.locale) : "",
  ].join("");

  return (
    `<!doctype html><html lang="${content.locale}"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(content.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLOR.canvas}">` +
    // Texto de vista previa: invisible en el cuerpo. El relleno evita que el buzon complete la vista previa con el resto del correo.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preview)}${"&#8203;&nbsp;".repeat(40)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.canvas}"><tr><td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">` +
    // Cabecera: la marca, con el punto dorado del icono.
    `<tr><td style="background:${COLOR.header};border-radius:12px 12px 0 0;padding:22px 32px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="width:32px;height:32px;background:${COLOR.brand};border-radius:8px;text-align:center;vertical-align:middle;font:700 16px/32px ${FONT};color:${COLOR.onDark}">M</td>` +
    `<td style="padding-left:12px;font:600 18px/32px ${FONT};color:${COLOR.onDark};letter-spacing:0.2px">MCLog<span style="color:${COLOR.accent}">.</span></td>` +
    `<td align="right" style="font:500 11px/32px ${FONT};color:${COLOR.onDarkMuted};letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(labels.tagline)}</td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="height:3px;line-height:3px;font-size:0;background:${COLOR.brand}">&nbsp;</td></tr>` +
    `<tr><td style="background:${COLOR.card};padding:36px 32px 32px">${body}</td></tr>` +
    `<tr><td style="background:${COLOR.footer};border-top:1px solid ${COLOR.border};border-radius:0 0 12px 12px;padding:20px 32px">` +
    paragraph(content.reason, `margin:0 0 6px;font:400 12px/1.6 ${FONT};color:${COLOR.muted}`) +
    paragraph(labels.automated, `margin:0;font:400 12px/1.6 ${FONT};color:${COLOR.muted}`) +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
};

const renderText = (content: EmailContent): string => {
  const labels = LABELS[content.locale];
  const sections = [
    content.heading,
    ...content.paragraphs,
    content.details?.length ? content.details.map(({ label, value }) => `${label}: ${value}`).join("\n") : "",
    content.code?.lines.length ? [`${content.code.title}:`, ...content.code.lines].join("\n") : "",
    content.action ? `${content.action.label}:\n${content.action.url}` : "",
    (content.notes ?? []).join("\n"),
    `--\n${content.reason}\n${labels.automated}`,
  ];
  return sections.filter((section) => section !== "").join("\n\n");
};

export const renderEmail = (content: EmailContent): { html: string; text: string } => ({
  html: renderHtml(content),
  text: renderText(content),
});
