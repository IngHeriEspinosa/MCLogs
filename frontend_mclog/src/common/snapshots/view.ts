import type { ResolvedRange } from "@/common/time/range";
import type { LogEntry } from "@/hooks/useAuth";
import type { AdvancedField, LogFilters, SortField } from "@/hooks/useLogFilters";
import type { SnapshotFilters } from "@/hooks/useSnapshots";

/**
 * Orden y paginacion de un snapshot, en el navegador: los logs ya vienen todos
 * con el snapshot (como mucho maxSnapshotRows), asi que no hay que volver a
 * pedir nada al cambiar de pagina ni de orden.
 */

/** El mismo orden que el enum de PostgreSQL, que es el que usa la tabla en vivo. */
const LEVEL_RANK: Record<LogEntry["level"], number> = { debug: 0, info: 1, warn: 2, error: 3 };

const keyOf = (log: LogEntry, field: SortField): number | string => {
  switch (field) {
    case "timestamp":
      return new Date(log.timestamp).getTime();
    case "level":
      return LEVEL_RANK[log.level] ?? -1;
    case "host":
      return log.host ?? "";
    default:
      return log[field] ?? "";
  }
};

/** Copia ordenada. A igualdad, el id desempata en la misma direccion, como en el servidor. */
export const sortLogs = (logs: LogEntry[], field: SortField, dir: "asc" | "desc"): LogEntry[] => {
  const sign = dir === "asc" ? 1 : -1;
  return [...logs].sort((a, b) => {
    const left = keyOf(a, field);
    const right = keyOf(b, field);
    const byField =
      typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return (byField || a.id - b.id) * sign;
  });
};

export type Page<T> = { rows: T[]; page: number; totalPages: number };

/** Una pagina, con la pagina pedida ajustada a las que existen. */
export const paginate = <T>(items: T[], page: number, pageSize: number): Page<T> => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return { rows: items.slice((current - 1) * pageSize, current * pageSize), page: current, totalPages };
};

/**
 * Los filtros de la vista, como los espera el backend al crear un snapshot: el
 * rango ya en fechas y sin los vacios. Logs no aplica la busqueda por campo,
 * asi que solo Registros (`advanced`) la manda: el snapshot tiene que enseñar
 * lo que se estaba viendo.
 */
// Los mismos que ADVANCED_FIELDS de useLogFilters. Se repiten porque ese modulo
// carga next/navigation, y este tiene que poder probarse fuera de Next.
const ADVANCED: readonly AdvancedField[] = ["message", "service", "host", "traceId", "errorName", "errorCode"];

export const toSnapshotFilters = (filters: LogFilters, resolved: ResolvedRange, advanced: boolean): SnapshotFilters => {
  const fields: (keyof SnapshotFilters & keyof LogFilters)[] = [
    "application",
    "level",
    "environment",
    "search",
    "fingerprint",
    ...(advanced ? ADVANCED : []),
  ];
  return {
    ...Object.fromEntries(fields.filter((key) => filters[key]).map((key) => [key, filters[key]])),
    from: resolved.from?.toISOString(),
    to: resolved.to?.toISOString(),
    sortField: filters.sortField,
    sortDir: filters.sortDir,
  };
};
