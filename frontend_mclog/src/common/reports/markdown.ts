/**
 * Piezas de Markdown que no se rompen con contenido de logs.
 *
 * Un mensaje de log puede traer "|", saltos de linea o ``` y desmontar una
 * tabla o cerrar antes de tiempo un bloque de codigo. Todo lo que viene de un
 * log pasa por aqui antes de entrar en un reporte.
 */

/** Celda de tabla: una sola linea y con las barras escapadas. */
export const mdCell = (value: unknown): string => {
  const text = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
  return text || "—";
};

export const mdTable = (header: string[], rows: unknown[][]): string =>
  [
    `| ${header.map(mdCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`),
  ].join("\n");

/** Codigo en linea. Si el valor lleva comillas invertidas, se usa un delimitador mas largo. */
export const mdCode = (value: string): string => {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  return longest ? `${ticks} ${value} ${ticks}` : `${ticks}${value}${ticks}`;
};

/** Bloque de codigo cuya valla siempre es mas larga que cualquier racha de ` del contenido. */
export const mdFence = (content: string, lang = ""): string => {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${content}\n${fence}`;
};

export const mdQuote = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");

export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const csvCell = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (header: string[], rows: unknown[][]): string =>
  [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

/** Primeras lineas de un stack y cuantas se omitieron. */
export const stackHead = (stack: string, lines: number) => {
  const all = stack.split(/\r?\n/);
  return { lines: all.slice(0, lines), omitted: Math.max(0, all.length - lines) };
};

/** Fecha en UTC, legible y sin ambiguedad: 2026-09-21 14:00Z. */
export const utcMinute = (value: string | number | Date): string =>
  new Date(value).toISOString().slice(0, 16).replace("T", " ") + "Z";

/** Valor escalar en YAML: las cadenas van como JSON, que es YAML valido. */
export const yamlScalar = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(String(value));
};

/**
 * Un enlace de la vista previa solo es clicable si apunta a `linkOrigin` (el
 * propio MCLog). Un mensaje de log puede traer "[pulsa aqui](https://phishing…)";
 * ese se queda en texto.
 */
export const safeHref = (href: string, linkOrigin?: string): string | null => {
  if (!linkOrigin) return null;
  try {
    const url = new URL(href);
    return url.origin === linkOrigin && (url.protocol === "https:" || url.protocol === "http:") ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Estimacion gruesa de tokens (~4 caracteres por token en texto mixto). */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

/** Barra de texto proporcional para tablas en Markdown plano. */
export const textBar = (value: number, max: number, width = 20): string => {
  if (value <= 0 || max <= 0) return "";
  const cells = Math.max(1, Math.round((value / max) * width));
  return "█".repeat(cells);
};
