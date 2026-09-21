"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "@/components/atoms/Button";
import { useI18n } from "@/common/i18n/I18nProvider";

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);
export const sameDay = (a?: Date | null, b?: Date | null) => !!a && !!b && startOfDay(a).getTime() === startOfDay(b).getTime();
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** YYYY-MM-DD en hora local, el formato de <input type="date">. */
export const toDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const fromDateValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

type CalendarProps = {
  /** Cualquier fecha del mes que se muestra. */
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelect: (day: Date) => void;
  start?: Date | null;
  end?: Date | null;
  /** Dia bajo el puntero mientras se elige el final: previsualiza el rango. */
  hovered?: Date | null;
  onHover?: (day: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
};

/**
 * Mes en rejilla con seleccion de rango.
 *
 * Teclado segun el patron de ARIA para selectores de fecha: una sola parada
 * de tabulador (tabindex movil), flechas para dias y semanas, RePag/AvPag para
 * meses, Inicio/Fin para los extremos de la semana.
 */
export const Calendar: React.FC<CalendarProps> = ({
  month,
  onMonthChange,
  onSelect,
  start,
  end,
  hovered,
  onHover,
  minDate,
  maxDate,
}) => {
  const { t, fmt, locale } = useI18n();
  const weekStart = locale === "es" ? 1 : 0;
  const [focused, setFocused] = useState<Date>(() => startOfDay(end ?? start ?? new Date()));
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const today = useMemo(() => startOfDay(new Date()), []);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(first, -((first.getDay() - weekStart + 7) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weekdays = days.slice(0, 7).map((day) => fmt.weekdayNarrow(day));

  // Si el dia enfocado queda fuera del mes visible, el tabindex pasa al dia 1.
  const tabbable = focused.getMonth() === month.getMonth() && focused.getFullYear() === month.getFullYear() ? focused : first;

  const disabled = (day: Date) => (minDate && day < startOfDay(minDate)) || (maxDate && day > startOfDay(maxDate)) || false;

  // Rango efectivo: con inicio y sin fin, el dia bajo el puntero hace de fin.
  const rangeEnd = end ?? (start && hovered ? hovered : null);
  const [low, high] =
    start && rangeEnd ? (start <= rangeEnd ? [start, rangeEnd] : [rangeEnd, start]) : [start ?? null, start ?? null];

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(focused)}"]`)?.focus();
  }, [focused, month]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: Date | null = null;
    if (event.key in deltas) next = addDays(focused, deltas[event.key]);
    else if (event.key === "PageUp") next = new Date(focused.getFullYear(), focused.getMonth() - 1, focused.getDate());
    else if (event.key === "PageDown") next = new Date(focused.getFullYear(), focused.getMonth() + 1, focused.getDate());
    else if (event.key === "Home") next = addDays(focused, -((focused.getDay() - weekStart + 7) % 7));
    else if (event.key === "End") next = addDays(focused, 6 - ((focused.getDay() - weekStart + 7) % 7));
    if (!next) return;

    event.preventDefault();
    moveFocus.current = true;
    setFocused(next);
    onHover?.(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) onMonthChange(next);
  };

  return (
    <div className="w-[17.5rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <IconButton icon="chevronLeft" label={t.time.prevMonth} size="sm" onClick={() => onMonthChange(addMonths(month, -1))} />
        <p className="font-heading text-sm font-semibold capitalize text-ink" aria-live="polite">
          {fmt.monthYear(first)}
        </p>
        <IconButton icon="chevronRight" label={t.time.nextMonth} size="sm" onClick={() => onMonthChange(addMonths(month, 1))} />
      </div>

      <div className="grid grid-cols-7 text-center" aria-hidden>
        {weekdays.map((weekday, index) => (
          <span key={index} className="pb-1 font-mono text-[0.6875rem] uppercase text-ink-3">
            {weekday}
          </span>
        ))}
      </div>

      <div ref={gridRef} role="group" aria-label={fmt.monthYear(first)} className="grid grid-cols-7" onKeyDown={onKeyDown} onMouseLeave={() => onHover?.(null)}>
        {days.map((day) => {
          const outside = day.getMonth() !== month.getMonth();
          const isStart = sameDay(day, low);
          const isEnd = sameDay(day, high);
          const inRange = !!low && !!high && day > low && day < high;
          const edge = isStart || isEnd;
          const off = disabled(day);
          const band =
            low && high && !sameDay(low, high)
              ? isStart
                ? "left-1/2 right-0"
                : isEnd
                  ? "left-0 right-1/2"
                  : inRange
                    ? "inset-x-0"
                    : ""
              : "";

          return (
            <div key={dayKey(day)} className="relative flex h-9 items-center justify-center">
              {band && <span aria-hidden className={`absolute inset-y-1 bg-brand-soft ${band}`} />}
              <button
                type="button"
                data-day={dayKey(day)}
                tabIndex={sameDay(day, tabbable) ? 0 : -1}
                disabled={off}
                aria-pressed={edge}
                aria-label={fmt.weekdayLong(day)}
                aria-current={sameDay(day, today) ? "date" : undefined}
                onClick={() => {
                  setFocused(day);
                  onSelect(day);
                }}
                onMouseEnter={() => onHover?.(day)}
                onFocus={() => setFocused(day)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-[0.8125rem] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  edge
                    ? "bg-brand-solid font-semibold text-white shadow-sm"
                    : inRange
                      ? "text-brand-ink hover:bg-brand/15"
                      : outside
                        ? "text-ink-3/60 hover:bg-surface-3"
                        : "text-ink hover:bg-surface-3"
                }`}
              >
                {day.getDate()}
                {sameDay(day, today) && !edge && (
                  <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent-400" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
