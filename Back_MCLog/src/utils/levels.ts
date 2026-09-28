import type { LogLevel } from "@prisma/client";

/** Niveles de log en el orden del enum de PostgreSQL, de menos a mas grave. */
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const parts = (value: string) => value.split(",").map((part) => part.trim());

/**
 * Filtro de nivel tal como llega en la query: uno o varios separados por comas
 * ("error" o "error,warn"). Es la regla de validacion; parseLevels da por hecho
 * que ya paso por aqui.
 */
export const isLevelList = (value: unknown): boolean =>
  typeof value === "string" && parts(value).every((part) => (LOG_LEVELS as readonly string[]).includes(part));

/**
 * Los niveles de la lista, sin repetir y en el orden del enum. `undefined` si
 * no hay ninguno, que equivale a no filtrar por nivel.
 */
export const parseLevels = (value: unknown): LogLevel[] | undefined => {
  if (typeof value !== "string") return undefined;
  const requested = new Set(parts(value));
  const levels = LOG_LEVELS.filter((level) => requested.has(level));
  return levels.length ? levels : undefined;
};
