"use client";
import React, { useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { Calendar, startOfDay } from "@/components/molecules/Calendar";
import { Portal } from "@/components/molecules/Portal";
import { useDismiss, useFloating } from "@/hooks/useFloating";
import { useI18n } from "@/common/i18n/I18nProvider";
import { closedWindow, isRelative, Preset, PRESETS, TimeRange } from "@/common/time/range";

type DateRangePickerProps = {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  /** Rangos rapidos a ofrecer. Por defecto, todos. */
  presets?: readonly Preset[];
  align?: "start" | "end";
  size?: "sm" | "md";
  className?: string;
  id?: string;
};

const toTime = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const withTime = (day: Date, time: string, endOfMinute = false) => {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours || 0, minutes || 0);
  if (endOfMinute) result.setSeconds(59, 999);
  return result;
};

/**
 * Selector de rango de tiempo: rangos rapidos en lista (nadie pelea con un
 * calendario para decir "ultimos 7 dias") y un rango a medida con calendario
 * y horas detras, que solo se aplica al confirmar.
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  presets = PRESETS,
  align = "start",
  size = "md",
  className = "",
  id,
}) => {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [month, setMonth] = useState(() => new Date());
  const [hovered, setHovered] = useState<Date | null>(null);
  const { anchorRef, floatingRef, style } = useFloating<HTMLButtonElement, HTMLDivElement>(open, { align });

  useDismiss(open, () => setOpen(false), [anchorRef, floatingRef]);

  const label = isRelative(value)
    ? t.time.presets[value.preset]
    : `${fmt.dateTimeShort(value.from)} – ${value.to ? fmt.dateTimeShort(value.to) : t.time.now}`;

  const show = () => {
    // Se parte del rango actual para que el calendario lo muestre marcado.
    const now = Date.now();
    const current = isRelative(value) && value.preset === "all" ? null : closedWindow(value, now);
    setStart(current ? startOfDay(current.from) : null);
    setEnd(current ? startOfDay(current.to) : null);
    setStartTime(current ? toTime(current.from) : "00:00");
    setEndTime(current ? toTime(current.to) : "23:59");
    setMonth(current?.to ?? new Date(now));
    setHovered(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    anchorRef.current?.focus();
  };

  const pickDay = (day: Date) => {
    if (!start || end) {
      setStart(day);
      setEnd(null);
      return;
    }
    if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  };

  const draftFrom = start ? withTime(start, startTime) : null;
  const draftTo = start ? withTime(end ?? start, endTime, true) : null;
  const valid = !!draftFrom && !!draftTo && draftFrom < draftTo;

  const apply = () => {
    if (!valid || !draftFrom || !draftTo) return;
    onChange({ from: draftFrom.toISOString(), to: draftTo.toISOString() });
    close();
  };

  const height = size === "sm" ? "h-8 text-[0.8125rem]" : "h-9 text-sm";

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t.time.label}: ${label}`}
        onClick={() => (open ? close() : show())}
        className={`field-base flex items-center gap-2 px-3 text-left ${height} ${open ? "border-brand ring-4 ring-brand/15" : ""} ${className}`}
      >
        <Icon name="calendar" className="h-4 w-4 text-ink-3" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{label}</span>
        <Icon name="chevronDown" className="h-3.5 w-3.5 text-ink-3" />
      </button>

      {open && (
        <Portal anchorRef={anchorRef}>
          <div
            ref={floatingRef}
            style={style}
            role="dialog"
            aria-label={t.time.label}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
            }}
            className="flex max-w-[calc(100vw-16px)] animate-pop-in flex-col overflow-y-auto rounded-2xl border border-line bg-surface shadow-pop sm:flex-row"
          >
            <div className="border-b border-line p-2 sm:w-52 sm:border-b-0 sm:border-r">
              <p className="eyebrow px-2 pb-1.5 pt-1">{t.time.quick}</p>
              <ul className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
                {presets.map((preset) => {
                  const selected = isRelative(value) && value.preset === preset;
                  return (
                    <li key={preset}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({ preset });
                          close();
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-3 ${
                          selected ? "font-semibold text-ink" : "text-ink-2"
                        }`}
                      >
                        {t.time.presets[preset]}
                        {selected && <Icon name="check" className="h-4 w-4 text-brand" strokeWidth={2.75} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{t.time.custom}</p>
                <p className="text-xs text-ink-3" aria-live="polite">
                  {!start ? t.time.pickStart : !end ? t.time.pickEnd : ""}
                </p>
              </div>
              <Calendar
                month={month}
                onMonthChange={setMonth}
                onSelect={pickDay}
                start={start}
                end={end}
                hovered={start && !end ? hovered : null}
                onHover={setHovered}
                maxDate={new Date()}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                  {t.time.startTime}
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="field-base h-8 px-2 font-mono text-[0.8125rem] tabular-nums"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                  {t.time.endTime}
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="field-base h-8 px-2 font-mono text-[0.8125rem] tabular-nums"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="min-w-0 truncate font-mono text-[0.6875rem] text-ink-3">
                  {draftFrom && draftTo ? `${fmt.dateTimeShort(draftFrom)} → ${fmt.dateTimeShort(draftTo)}` : "—"}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="ghost" onClick={close}>
                    {t.common.cancel}
                  </Button>
                  <Button size="sm" variant="primary" onClick={apply} disabled={!valid}>
                    {t.common.apply}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
};
