"use client";
import React from "react";
import { Level, LEVEL_FILL, LEVELS } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { useI18n } from "@/common/i18n/I18nProvider";

type LevelCounts = Record<Level, number>;

/**
 * Parte de un todo por nivel: una barra al 100 % con 2 px de hueco entre
 * tramos y, debajo, cada nivel con su numero y su porcentaje. La barra da la
 * proporcion de un vistazo; la lista, el dato exacto.
 */
export const LevelMix: React.FC<{
  counts: LevelCounts;
  onSelect?: (level: Level) => void;
  loading?: boolean;
}> = ({ counts, onSelect, loading }) => {
  const { t, fmt } = useI18n();
  const total = LEVELS.reduce((sum, level) => sum + counts[level], 0);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-2.5 w-full rounded-full" />
        {LEVELS.map((level) => (
          <Skeleton key={level} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {total > 0 &&
          LEVELS.map((level) =>
            counts[level] > 0 ? (
              <span
                key={level}
                className={`h-full ${LEVEL_FILL[level]}`}
                style={{ width: `${(counts[level] / total) * 100}%`, minWidth: 3 }}
              />
            ) : null,
          )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {LEVELS.map((level) => {
          const share = total > 0 ? counts[level] / total : 0;
          const content = (
            <>
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${LEVEL_FILL[level]}`} />
              <span className="flex-1 text-left text-sm text-ink-2">{t.levels.names[level]}</span>
              <span className="text-sm font-semibold tabular-nums text-ink">{fmt.number(counts[level])}</span>
              <span className="w-14 text-right text-xs tabular-nums text-ink-3">{fmt.percent(share)}</span>
            </>
          );
          return (
            <li key={level}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(level)}
                  title={t.overview.filterBy(t.levels.names[level])}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-2.5 px-2 py-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export type BarListItem = { key: string; label: string; value: number; hint?: string };

/**
 * Ranking en barras horizontales de un solo color: las categorias no tienen
 * orden propio, asi que un color por barra solo anadiria ruido.
 */
export const BarList: React.FC<{
  items: BarListItem[];
  onSelect?: (key: string) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  mono?: boolean;
}> = ({ items, onSelect, loading, empty, mono }) => {
  const { t, fmt } = useI18n();
  const max = Math.max(1, ...items.map((item) => item.value));

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return <p className="py-6 text-center text-sm text-ink-3">{empty}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-sm text-ink ${mono ? "font-mono text-[0.8125rem]" : ""}`}>{item.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{fmt.compact(item.value)}</span>
            </span>
            <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </span>
            {item.hint && <span className="mt-1 block text-xs text-ink-3">{item.hint}</span>}
          </>
        );
        return (
          <li key={item.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                title={t.overview.filterBy(item.label)}
                className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                {content}
              </button>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
