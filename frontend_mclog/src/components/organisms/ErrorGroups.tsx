"use client";
// Organism: ErrorGroups (tarjetas y tabla de errores agrupados, en vivo o en un snapshot)
import React from "react";
import { EmptyState } from "@/components/atoms/EmptyState";
import { LevelBadge } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { StatTile } from "@/components/molecules/StatTile";
import { useI18n } from "@/common/i18n/I18nProvider";
import { summarizeGroups } from "@/common/errors/summary";
import type { ErrorGroup } from "@/hooks/useErrors";

/** Tope de grupos que pide la pantalla (y que guarda un snapshot). */
export const GROUPS_CAP = 100;

type KpisProps = {
  groups: ErrorGroup[];
  level: "error" | "warn";
  loading?: boolean;
  stale?: boolean;
};

/** Fallos distintos, ocurrencias, app mas afectada y concentracion. */
export const ErrorKpis: React.FC<KpisProps> = ({ groups, level, loading, stale }) => {
  const { t, fmt } = useI18n();
  const summary = summarizeGroups(groups);
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 3xl:gap-4">
      <StatTile
        label={t.errors.kpiGroups}
        info={t.fieldInfo.metrics.groups}
        value={`${fmt.number(groups.length)}${groups.length >= GROUPS_CAP ? "+" : ""}`}
        icon="hash"
        accent={level === "warn" ? "warn" : "error"}
        loading={loading}
        stale={stale}
      />
      <StatTile
        label={t.errors.kpiOccurrences}
        info={t.fieldInfo.metrics.occurrences}
        value={fmt.compact(summary.occurrences)}
        icon="activity"
        accent="neutral"
        loading={loading}
        stale={stale}
      />
      <StatTile
        label={t.errors.kpiTopApp}
        info={t.fieldInfo.metrics.topApp}
        value={<span className="font-mono text-[1.375rem]">{summary.topApp?.application ?? "—"}</span>}
        hint={summary.topApp ? t.errors.occurrencesCount(fmt.number(summary.topApp.count)) : undefined}
        icon="box"
        accent="neutral"
        loading={loading}
        stale={stale}
      />
      <StatTile
        label={t.errors.kpiTopShare}
        info={t.fieldInfo.metrics.topShare}
        value={fmt.percent(summary.topShare)}
        hint={t.errors.kpiTopShareHint}
        icon="chart"
        accent="brand"
        loading={loading}
        stale={stale}
      />
    </div>
  );
};

type TableProps = {
  groups: ErrorGroup[];
  loading?: boolean;
  stale?: boolean;
  /** Botones de la ultima columna de cada fila. */
  actions?: (group: ErrorGroup) => React.ReactNode;
};

/**
 * Una fila por fallo distinto: veces y su parte del total, clase, codigo y un
 * mensaje de ejemplo, aplicacion, nivel y primera y ultima aparicion.
 */
export const ErrorGroupsTable: React.FC<TableProps> = ({ groups, loading, stale, actions }) => {
  const { t, fmt } = useI18n();
  const { occurrences, max } = summarizeGroups(groups);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {loading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon="checkCircle" title={t.errors.empty} description={t.errors.emptyHint} />
      ) : (
        <div className={`overflow-x-auto transition-opacity ${stale ? "opacity-70" : ""}`}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-surface-2 text-left">
                {[
                  { label: t.errors.columns.count, className: "pl-5 w-32" },
                  { label: t.errors.columns.error, className: "w-full" },
                  { label: t.errors.columns.application, className: "hidden lg:table-cell" },
                  { label: t.errors.columns.level, className: "hidden md:table-cell" },
                  { label: t.errors.columns.activity, className: "hidden xl:table-cell" },
                  ...(actions ? [{ label: "", className: "" }] : []),
                ].map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`whitespace-nowrap border-b border-line px-3 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 ${column.className}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.fingerprint} className="group align-top transition-colors hover:bg-surface-2">
                  <td className="border-b border-line py-3.5 pl-5 pr-3">
                    <p className="font-mono text-lg font-semibold tabular-nums leading-none text-ink">{fmt.compact(group.count)}</p>
                    <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div
                        className={`h-full rounded-full ${group.level === "warn" ? "bg-lvl-warn" : "bg-lvl-error"}`}
                        style={{ width: `${Math.max(4, (group.count / max) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 whitespace-nowrap text-[0.6875rem] text-ink-3">
                      {t.errors.share(fmt.percent(occurrences ? group.count / occurrences : 0))}
                    </p>
                  </td>
                  <td className="w-full max-w-0 border-b border-line px-3 py-3.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium text-ink">{group.errorName ?? t.errors.noClass}</span>
                      {group.errorCode && (
                        <Tag mono tone="neutral">
                          {group.errorCode}
                        </Tag>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 break-words font-mono text-[0.8125rem] leading-relaxed text-ink-2" title={group.sampleMessage}>
                      {group.sampleMessage}
                    </p>
                    <p className="mt-1 font-mono text-[0.6875rem] text-ink-3">
                      #{group.fingerprint.slice(0, 12)}
                      <span className="lg:hidden"> · {group.application}</span>
                    </p>
                  </td>
                  <td className="hidden whitespace-nowrap border-b border-line px-3 py-3.5 lg:table-cell">
                    <p className="font-mono text-[0.8125rem] text-ink">{group.application}</p>
                    {group.service && group.service !== group.application && (
                      <p className="font-mono text-xs text-ink-3">{group.service}</p>
                    )}
                  </td>
                  <td className="hidden border-b border-line px-3 py-3.5 md:table-cell">
                    <LevelBadge level={group.level} />
                  </td>
                  <td className="hidden whitespace-nowrap border-b border-line px-3 py-3.5 text-xs xl:table-cell">
                    <p className="text-ink-2" title={fmt.dateTime(group.lastSeen)}>
                      {t.errors.lastSeen(fmt.relative(group.lastSeen))}
                    </p>
                    <p className="mt-0.5 text-ink-3" title={fmt.dateTime(group.firstSeen)}>
                      {t.errors.firstSeen(fmt.relative(group.firstSeen))}
                    </p>
                  </td>
                  {actions && (
                    <td className="whitespace-nowrap border-b border-line py-3.5 pl-3 pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">{actions(group)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length >= GROUPS_CAP && <p className="px-5 py-3 text-xs text-ink-3">{t.errors.capped}</p>}
        </div>
      )}
    </section>
  );
};
