"use client";
import React, { useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { Calendar, fromDateValue, toDateValue } from "@/components/molecules/Calendar";
import { Portal } from "@/components/molecules/Portal";
import { useDismiss, useFloating } from "@/hooks/useFloating";
import { useI18n } from "@/common/i18n/I18nProvider";

type DatePickerProps = {
  /** YYYY-MM-DD, o cadena vacia para "sin fecha". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
  "aria-describedby"?: string;
};

/** Selector de un solo dia con el mismo calendario que el de rangos. */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
  id,
  "aria-describedby": describedBy,
}) => {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = value ? fromDateValue(value) : null;
  const [month, setMonth] = useState(() => selected ?? minDate ?? new Date());
  const { anchorRef, floatingRef, style } = useFloating<HTMLButtonElement, HTMLDivElement>(open);

  useDismiss(open, () => setOpen(false), [anchorRef, floatingRef]);

  const close = () => {
    setOpen(false);
    anchorRef.current?.focus();
  };

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => {
          if (!open) setMonth(selected ?? minDate ?? new Date());
          setOpen((current) => !current);
        }}
        className={`field-base flex h-9 items-center gap-2 px-3 text-left ${open ? "border-brand ring-4 ring-brand/15" : ""}`}
      >
        <Icon name="calendar" className="h-4 w-4 text-ink-3" />
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink-3"}`}>
          {selected ? fmt.date(selected) : placeholder ?? t.time.selectDate}
        </span>
        <Icon name="chevronDown" className="h-3.5 w-3.5 text-ink-3" />
      </button>

      {open && (
        <Portal anchorRef={anchorRef}>
          <div
            ref={floatingRef}
            style={style}
            role="dialog"
            aria-label={t.time.selectDate}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                event.preventDefault();
                close();
              }
            }}
            className="animate-pop-in overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-pop"
          >
            <Calendar
              month={month}
              onMonthChange={setMonth}
              start={selected}
              end={selected}
              minDate={minDate}
              maxDate={maxDate}
              onSelect={(day) => {
                onChange(toDateValue(day));
                close();
              }}
            />
            {value && (
              <div className="mt-2 flex justify-end border-t border-line pt-2">
                <Button
                  size="xs"
                  variant="ghost"
                  icon="x"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                >
                  {t.time.clearDate}
                </Button>
              </div>
            )}
          </div>
        </Portal>
      )}
    </>
  );
};
