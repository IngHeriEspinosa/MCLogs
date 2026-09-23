/**
 * Enmascarado de datos sensibles en lo que sale del espacio de trabajo.
 *
 * Es el mismo juego de reglas que usa el frontend para los reportes de IA
 * (frontend_mclog/src/common/reports/redact.ts): si se cambia una regla, hay
 * que cambiarla en los dos sitios. Aqui se aplica en el servidor porque un
 * snapshot publico no puede depender de que el cliente haya enmascarado.
 *
 * Solo toca texto libre (mensajes, stacks, metadata). Los identificadores que
 * sirven para seguir investigando (huella, traceId, id de log) se dejan tal cual.
 */

type Replacer = (substring: string, ...groups: string[]) => string;
type Rule = { pattern: RegExp; replace: string | Replacer };

/**
 * Un UUID en un mensaje ("pedido 550e8400-… no encontrado") es casi siempre el
 * id de una entidad, y es lo que hace falta para seguir el rastro. Los que si
 * son credenciales suelen ir tras "token=", "Bearer" o una clave con nombre de
 * secreto, y esas reglas van antes.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  { pattern: /\b[A-Za-z0-9_-]{32,}\b/g, replace: (match) => (UUID.test(match) ? match : "[REDACTED:key]") },
];

const SENSITIVE_KEY = /^(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|set-cookie|access[_-]?key|client[_-]?secret|private[_-]?key|refresh[_-]?token)$/i;

const SECRET = "[REDACTED:secret]";

const applyRules = (text: string, onMask: () => void): string =>
  RULES.reduce(
    (current, { pattern, replace }) =>
      current.replace(pattern, (match: string, ...groups: string[]) => {
        const masked = typeof replace === "string" ? replace : replace(match, ...groups);
        if (masked !== match) onMask();
        return masked;
      }),
    text,
  );

const noop = () => undefined;

/**
 * Enmascarador que cuenta lo que tapa. La vista previa lo muestra: "12 valores
 * enmascarados" da confianza, y un 0 en un reporte lleno de correos avisa de
 * que algo se escapa a las reglas.
 */
export const createRedactor = () => {
  let masked = 0;
  const onMask = () => {
    masked += 1;
  };
  const value = (input: unknown): unknown => {
    if (typeof input === "string") return applyRules(input, onMask);
    if (Array.isArray(input)) return input.map(value);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, entry]) => {
          if (!SENSITIVE_KEY.test(key)) return [key, value(entry)];
          onMask();
          return [key, SECRET];
        }),
      );
    }
    return input;
  };
  return {
    text: (input: string) => applyRules(input, onMask),
    value,
    get count() {
      return masked;
    },
  };
};

export const redactText = (text: string): string => applyRules(text, noop);

/** Recorre objetos y arrays; las claves con nombre de secreto pierden el valor entero. */
export const redactValue = (value: unknown): unknown => createRedactor().value(value);
