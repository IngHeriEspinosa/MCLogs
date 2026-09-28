import type { Level } from "@/components/atoms/LevelBadge";

/**
 * El filtro de nivel admite varios a la vez. En la URL, en la API y en los
 * snapshots viaja como una lista separada por comas ("error,warn"), que es lo
 * que guarda LogFilters; estas funciones pasan de un formato al otro.
 */

/** Del mas grave al menos: el orden de la lista de opciones y de la URL. */
const ORDER: readonly Level[] = ["error", "warn", "info", "debug"];

/** "warn,error,bogus,warn" -> ["error", "warn"]: sin desconocidos, sin repetidos y en orden fijo. */
export const parseLevels = (value: string): Level[] => {
  const requested = new Set(value.split(",").map((part) => part.trim()));
  return ORDER.filter((level) => requested.has(level));
};

/** La lista para la URL, en orden fijo: la misma seleccion da siempre el mismo enlace. */
export const joinLevels = (levels: readonly string[]): string => ORDER.filter((level) => levels.includes(level)).join(",");
