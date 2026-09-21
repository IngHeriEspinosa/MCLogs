/**
 * Enmascarado de datos sensibles antes de exportar.
 *
 * Los reportes para agentes suelen acabar pegados en un modelo externo, y los
 * logs arrastran de todo: correos de clientes, IPs, cabeceras Authorization,
 * JWT... Esto no sustituye a no loguear secretos, pero reduce lo que sale.
 *
 * Solo se aplica a texto libre (mensajes, stacks, metadata). Los
 * identificadores que el agente necesita citar (huella, traceId, id de log)
 * se dejan intactos: una huella SHA-256 pareceria una clave larga y se
 * perderia justo el dato que permite seguir investigando.
 */

type Replacer = (substring: string, ...groups: string[]) => string;
type Rule = { pattern: RegExp; replace: string | Replacer };

// El orden importa: lo especifico (JWT, "Bearer x", "password=x") antes que la
// regla generica de cadenas largas, que si no se lo comeria todo.
const RULES: Rule[] = [
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: "[REDACTED:jwt]" },
  { pattern: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replace: (_match, scheme) => `${scheme} [REDACTED:token]` },
  {
    pattern:
      /\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|access[_-]?key|client[_-]?secret|private[_-]?key)(["']?\s*[:=]\s*["']?)([^\s"',;&}]{3,})/gi,
    replace: (_match, key, separator) => `${key}${separator}[REDACTED:secret]`,
  },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replace: "[REDACTED:email]" },
  {
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    replace: "[REDACTED:ip]",
  },
  { pattern: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g, replace: "[REDACTED:ip]" },
  // Claves, tokens y hashes sueltos: 32+ caracteres seguidos sin espacios.
  { pattern: /\b[A-Za-z0-9_-]{32,}\b/g, replace: "[REDACTED:key]" },
];

const SENSITIVE_KEY = /^(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|set-cookie|access[_-]?key|client[_-]?secret|private[_-]?key|refresh[_-]?token)$/i;

export const redactText = (text: string): string =>
  RULES.reduce((current, { pattern, replace }) => {
    if (typeof replace === "string") return current.replace(pattern, replace);
    return current.replace(pattern, replace);
  }, text);

/** Recorre objetos y arrays; las claves con nombre de secreto pierden el valor entero. */
export const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED:secret]" : redactValue(entry),
      ]),
    );
  }
  return value;
};
