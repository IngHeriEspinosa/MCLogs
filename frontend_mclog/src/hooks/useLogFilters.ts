"use client";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_RANGE, rangeFromParams, rangeToParams, sameRange, TimeRange } from "@/common/time/range";

export type SortField = "timestamp" | "application" | "level" | "host" | "environment";
export const SORT_FIELDS: readonly SortField[] = ["timestamp", "application", "level", "host", "environment"];
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Campos de la busqueda avanzada de Registros: cada uno filtra una columna concreta. */
export const ADVANCED_FIELDS = ["message", "service", "host", "traceId", "errorName", "errorCode"] as const;
export type AdvancedField = (typeof ADVANCED_FIELDS)[number];

export type LogFilters = {
  range: TimeRange;
  level: string;
  environment: string;
  application: string;
  search: string;
  /** Huella de un fallo: se llega aqui desde la vista de errores agrupados. */
  fingerprint: string;
  message: string;
  service: string;
  host: string;
  traceId: string;
  errorName: string;
  errorCode: string;
  sortField: SortField;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

const DEFAULTS: LogFilters = {
  range: DEFAULT_RANGE,
  level: "",
  environment: "",
  application: "",
  search: "",
  fingerprint: "",
  message: "",
  service: "",
  host: "",
  traceId: "",
  errorName: "",
  errorCode: "",
  sortField: "timestamp",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

const parse = (params: URLSearchParams): LogFilters => {
  const sortField = params.get("sortField");
  const pageSize = Number(params.get("pageSize"));
  return {
    range: rangeFromParams(params),
    level: params.get("level") ?? "",
    environment: params.get("environment") ?? "",
    application: params.get("application") ?? "",
    search: params.get("search") ?? "",
    fingerprint: params.get("fingerprint") ?? "",
    ...(Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, params.get(key) ?? ""])) as Record<AdvancedField, string>),
    sortField: SORT_FIELDS.includes(sortField as SortField) ? (sortField as SortField) : "timestamp",
    sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
    page: Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1),
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 25,
  };
};

/** Solo lo que difiere del valor por defecto va a la URL: los enlaces quedan cortos. */
const serialize = (filters: LogFilters) => {
  const params = new URLSearchParams();
  if (!sameRange(filters.range, DEFAULTS.range)) {
    Object.entries(rangeToParams(filters.range)).forEach(([key, value]) => value && params.set(key, value));
  }
  (["level", "environment", "application", "search", "fingerprint", ...ADVANCED_FIELDS] as const).forEach((key) => {
    if (filters[key]) params.set(key, filters[key]);
  });
  if (filters.sortField !== DEFAULTS.sortField) params.set("sortField", filters.sortField);
  if (filters.sortDir !== DEFAULTS.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.page !== DEFAULTS.page) params.set("page", String(filters.page));
  if (filters.pageSize !== DEFAULTS.pageSize) params.set("pageSize", String(filters.pageSize));
  return params.toString();
};

/**
 * Filtros de la vista de logs, con la URL como unica fuente de verdad: un
 * enlace copiado abre exactamente la misma vista, y atras/adelante del
 * navegador funcionan como se espera.
 */
export function useLogFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => parse(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<LogFilters>) => {
      // Cualquier cambio de filtro vuelve a la primera pagina, salvo que el
      // propio cambio sea de pagina.
      const next = { ...filters, ...patch, page: "page" in patch ? (patch.page as number) : 1 };
      const query = serialize(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const reset = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const activeCount = [filters.level, filters.environment, filters.application, filters.search, filters.fingerprint].filter(Boolean).length;

  const advancedCount = ADVANCED_FIELDS.filter((key) => filters[key]).length;

  return { filters, setFilters, reset, activeCount, advancedCount };
}
