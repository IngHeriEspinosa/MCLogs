import { createHash } from "crypto";

/**
 * Huella de agrupacion de errores.
 *
 * Dos ocurrencias del mismo fallo casi nunca tienen el mismo mensaje: llevan
 * dentro el id del pedido, un UUID de peticion, una hora o una URL. Sin
 * normalizar eso, "el mismo error 400 veces" aparecen como 400 errores
 * distintos y no hay forma de saber que esta fallando de verdad.
 *
 * La huella se calcula sobre la parte estable del error para que esas 400
 * ocurrencias caigan en un unico grupo.
 */

export type FingerprintInput = {
  application: string;
  service?: string | null;
  message: string;
  errorName?: string | null;
  errorCode?: string | null;
  errorStack?: string | null;
};

/**
 * Sustituye por marcadores lo que cambia entre ocurrencias del mismo error.
 * El orden importa: las URLs y los correos se reemplazan antes que los numeros
 * sueltos, que si no se los comerian por dentro.
 */
export const normalizeMessage = (message: string): string => {
  // Solo la primera linea: el resto suele ser el stack o el detalle variable.
  const firstLine = message.split("\n")[0]?.trim() ?? "";

  return firstLine
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "<uuid>")
    .replace(/\b0x[0-9a-f]+\b/g, "<hex>")
    .replace(/\b[0-9a-f]{8,}\b/g, "<hex>")
    .replace(/'[^']*'|"[^"]*"/g, "<str>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Primer marco del stack, sin numeros de linea ni columna: cambian con cada
 * recompilacion y partirian en dos el grupo de un error que no ha cambiado.
 */
/**
 * Quita la posicion final del marco, tanto `:linea:columna` como solo `:linea`,
 * y conserva el parentesis de cierre si lo habia. Normaliza ademas espacios y
 * mayusculas para que dos escrituras del mismo marco no se separen.
 */
const stripPosition = (frame: string): string =>
  frame
    .replace(/:\d+(?::\d+)?(\))?$/, (_full, paren: string | undefined) => paren ?? "")
    .replace(/\s+/g, " ")
    .toLowerCase();

export const firstStackFrame = (stack: string): string | undefined => {
  const lines = stack.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("at ")) return stripPosition(trimmed);
  }

  // NetSuite y otros entornos no usan el formato "at ...": se toma la primera
  // linea con contenido que no sea el propio mensaje de la excepcion.
  const fallback = lines.map((line) => line.trim()).find((line) => line !== "" && !line.startsWith("Error"));
  return fallback ? stripPosition(fallback) : undefined;
};

/**
 * Calcula la huella. 32 caracteres hex: colision despreciable a esta escala y
 * mas manejable que un sha256 completo al mostrarlo o compartirlo.
 */
export const computeFingerprint = (input: FingerprintInput): string => {
  const frame = input.errorStack ? firstStackFrame(input.errorStack) : undefined;

  const parts = [
    input.application,
    input.service ?? "",
    input.errorName ?? "",
    input.errorCode ?? "",
    frame ?? "",
    normalizeMessage(input.message),
  ];

  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 32);
};

/** Niveles para los que tiene sentido agrupar: nadie investiga grupos de "info". */
const GROUPABLE_LEVELS = new Set(["error", "warn"]);

export const shouldFingerprint = (level: string) => GROUPABLE_LEVELS.has(level);
