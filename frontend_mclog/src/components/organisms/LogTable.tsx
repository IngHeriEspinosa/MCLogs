"use client";
import React, { useRef } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, IconButton } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { isLevel, LEVEL_FILL, LevelBadge } from "@/components/atoms/LevelBadge";
import { Segmented } from "@/components/atoms/Segmented";
import { Spinner } from "@/components/atoms/Spinner";
import { EnvTag, Tag } from "@/components/atoms/Tag";
import { Select } from "@/components/molecules/Select";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { LogEntry } from "@/hooks/useAuth";
import { PAGE_SIZES, SORT_FIELDS, SortField } from "@/hooks/useLogFilters";
import type { BufferedLog } from "@/hooks/useLogStream";

export type LogRow = LogEntry | BufferedLog;
export type Density = "comfortable" | "compact";

export const rowKey = (row: LogRow) => ("streamKey" in row ? row.streamKey : `log-${row.id}`);

type LogTableProps = {
  rows: LogRow[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  selectedKey: string | null;
  onSelect: (row: LogRow) => void;
  density: Density;
  onDensity: (density: Density) => void;
  live: boolean;
  onWidenRange?: () => void;
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (sort: { sortField?: SortField; sortDir?: "asc" | "desc" }) => void;
  /** Accion junto al titulo, p. ej. el enlace a la vista de Registros. */
  titleAction?: React.ReactNode;
};

const COLUMN = "border-b border-line px-3 align-middle";

/**
 * Tabla de registros con aspecto de consola: cabecera fija dentro de su propio
 * scroll, una barra de severidad a la izquierda de cada fila y la hora con
 * milisegundos en monoespaciada. Las columnas secundarias (host, traza)
 * aparecen solo cuando hay ancho para ellas, que en 4K es siempre.
 */
export const LogTable: React.FC<LogTableProps> = ({
  rows,
  loading,
  fetching,
  error,
  total,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
  selectedKey,
  onSelect,
  density,
  onDensity,
  live,
  onWidenRange,
  sortField,
  sortDir,
  onSort,
  titleAction,
}) => {
  const { t, fmt } = useI18n();
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const padding = density === "compact" ? "py-1.5" : "py-2.5";
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const onRowKeyDown = (event: React.KeyboardEvent, index: number, row: LogRow) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(row);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    const element = bodyRef.current?.querySelector<HTMLTableRowElement>(`tr[data-row="${next}"]`);
    if (!element) return;
    element.focus();
    // Con el inspector abierto, moverse por la tabla va cambiando el detalle.
    if (selectedKey && rows[next]) onSelect(rows[next]);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-label={t.logs.tableLabel}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="flex items-baseline gap-1.5 font-heading text-[0.9375rem] font-semibold text-ink">
            <span className="font-mono text-xs font-medium tabular-nums text-ink-3">{fmt.number(total)}</span>
            {t.logs.resultsLabel(total)}
          </h2>
          {titleAction}
          {fetching && !loading && <Spinner className="h-3.5 w-3.5 text-ink-3" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="hidden text-[0.6875rem] text-ink-3 3xl:block">{t.logs.shortcuts}</p>
          <div className="flex items-center gap-1">
            <div className="w-36">
              <Select
                size="sm"
                label={t.logs.sortBy}
                icon="sort"
                value={sortField}
                onChange={(value) => onSort({ sortField: value as SortField })}
                options={SORT_FIELDS.map((field) => ({ value: field, label: t.logs.sortFields[field] }))}
              />
            </div>
            <IconButton
              size="sm"
              variant="secondary"
              icon={sortDir === "desc" ? "arrowDown" : "arrowUp"}
              label={`${t.logs.toggleSortDir} (${sortDir === "desc" ? t.logs.sortDesc : t.logs.sortAsc})`}
              onClick={() => onSort({ sortDir: sortDir === "desc" ? "asc" : "desc" })}
            />
          </div>
          <Segmented
            label={t.logs.density}
            size="sm"
            value={density}
            onChange={onDensity}
            options={[
              { value: "comfortable", label: "", icon: "rows", title: t.logs.densityComfortable },
              { value: "compact", label: "", icon: "rowsDense", title: t.logs.densityCompact },
            ]}
          />
          <div className="w-36">
            <Select
              size="sm"
              label={t.logs.perPage(pageSize)}
              value={String(pageSize)}
              onChange={(value) => onPageSize(Number(value))}
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: t.logs.perPage(size) }))}
              align="end"
            />
          </div>
        </div>
      </header>

      {error ? (
        <div className="p-4">
          <Alert variant="error" title={t.logs.loadError}>
            {errorMessage(error, t.common.unknownError)}
          </Alert>
        </div>
      ) : (
        <div className={`max-h-[max(28rem,calc(100vh-12rem))] overflow-auto transition-opacity ${fetching && !loading ? "opacity-70" : ""}`}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2/95 text-left backdrop-blur">
                {[
                  { label: t.logs.columns.time, className: "pl-5" },
                  { label: t.logs.columns.level, className: "" },
                  { label: t.logs.columns.application, className: "" },
                  { label: t.logs.columns.environment, className: "hidden md:table-cell" },
                  { label: t.logs.columns.host, className: "hidden 2xl:table-cell" },
                  { label: t.logs.columns.message, className: "w-full" },
                  { label: t.logs.columns.trace, className: "hidden 4xl:table-cell" },
                ].map((column) => (
                  <th
                    key={column.label}
                    scope="col"
                    className={`whitespace-nowrap border-b border-line px-3 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 ${column.className}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading &&
                Array.from({ length: 10 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className={`${COLUMN} ${padding} pl-5`}>
                      <div className="flex items-center gap-4">
                        <div className="skeleton h-4 w-24" />
                        <div className="skeleton h-4 w-14" />
                        <div className="skeleton h-4 w-24" />
                        <div className="skeleton h-4 flex-1" style={{ maxWidth: `${40 + ((index * 23) % 50)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading &&
                rows.map((row, index) => {
                  const key = rowKey(row);
                  const selected = key === selectedKey;
                  const fresh = "streamKey" in row;
                  const level = isLevel(row.level) ? row.level : "debug";
                  return (
                    <tr
                      key={key}
                      data-row={index}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => onSelect(row)}
                      onKeyDown={(event) => onRowKeyDown(event, index, row)}
                      className={`group cursor-pointer outline-none transition-colors focus-visible:bg-brand-soft/50 ${
                        selected ? "bg-brand-soft/70" : "hover:bg-surface-2"
                      } ${fresh ? "animate-row-flash" : ""}`}
                    >
                      <td className={`relative whitespace-nowrap ${COLUMN} ${padding} pl-5`}>
                        <span
                          aria-hidden
                          className={`absolute bottom-1.5 left-2 top-1.5 w-[3px] rounded-full ${LEVEL_FILL[level]} ${
                            selected ? "" : "opacity-70 group-hover:opacity-100"
                          }`}
                        />
                        {density === "compact" ? (
                          <span className="font-mono text-[0.8125rem] tabular-nums text-ink">
                            <span className="text-ink-3">{fmt.dayMonth(row.timestamp)} </span>
                            {fmt.timeSeconds(row.timestamp)}
                          </span>
                        ) : (
                          <>
                            <span className="block font-mono text-[0.8125rem] tabular-nums text-ink">{fmt.timeSeconds(row.timestamp)}</span>
                            <span className="block font-mono text-[0.6875rem] text-ink-3">{fmt.dayMonth(row.timestamp)}</span>
                          </>
                        )}
                      </td>
                      <td className={`${COLUMN} ${padding}`}>
                        <LevelBadge level={row.level} />
                      </td>
                      <td className={`${COLUMN} ${padding}`}>
                        <span className="block max-w-[16rem] truncate font-medium text-ink">{row.application}</span>
                        {density === "comfortable" && row.service && row.service !== row.application && (
                          <span className="block max-w-[16rem] truncate text-xs text-ink-3">{row.service}</span>
                        )}
                      </td>
                      <td className={`hidden md:table-cell ${COLUMN} ${padding}`}>
                        <EnvTag environment={row.environment} label={t.envs.names[row.environment] ?? row.environment} />
                      </td>
                      <td className={`hidden max-w-[14rem] truncate font-mono text-xs text-ink-3 2xl:table-cell ${COLUMN} ${padding}`}>
                        {row.host ?? "—"}
                      </td>
                      <td className={`w-full max-w-0 ${COLUMN} ${padding}`}>
                        <div className="flex min-w-0 items-center gap-2">
                          {row.errorName && (
                            <Tag tone="danger" mono className="shrink-0">
                              {row.errorName}
                            </Tag>
                          )}
                          <span className="truncate text-ink-2" title={row.message}>
                            {row.message}
                          </span>
                          {fresh && (
                            <Tag tone="accent" className="ml-auto shrink-0">
                              {t.logs.newRow}
                            </Tag>
                          )}
                        </div>
                      </td>
                      <td className={`hidden whitespace-nowrap font-mono text-xs text-ink-3 4xl:table-cell ${COLUMN} ${padding}`}>
                        {row.traceId ? `${row.traceId.slice(0, 12)}…` : "—"}
                      </td>
                    </tr>
                  );
                })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={live ? "radio" : "search"}
                      title={live ? t.logs.emptyLive : t.logs.empty}
                      description={live ? t.logs.emptyLiveHint : t.logs.emptyHint}
                      action={
                        !live && onWidenRange ? (
                          <Button size="sm" icon="calendar" onClick={onWidenRange}>
                            {t.logs.widenRange}
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="font-mono text-xs tabular-nums text-ink-3">
          {t.logs.pageRange(fmt.number(first), fmt.number(last), fmt.number(total))}
        </p>
        <nav className="flex items-center gap-1" aria-label={t.logs.pageOf(String(page), String(totalPages))}>
          <IconButton icon="chevronsLeft" label={t.logs.firstPage} size="sm" disabled={page <= 1} onClick={() => onPage(1)} />
          <IconButton icon="chevronLeft" label={t.logs.prevPage} size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} />
          <span className="px-2 font-mono text-xs tabular-nums text-ink-2">
            {t.logs.pageOf(fmt.number(page), fmt.number(Math.max(1, totalPages)))}
          </span>
          <IconButton
            icon="chevronRight"
            label={t.logs.nextPage}
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          />
          <IconButton
            icon="chevronsRight"
            label={t.logs.lastPage}
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPage(totalPages)}
          />
        </nav>
      </footer>
    </section>
  );
};
