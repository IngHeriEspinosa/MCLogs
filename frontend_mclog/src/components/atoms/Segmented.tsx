"use client";
import React, { useRef } from "react";
import { Icon, IconName } from "@/components/atoms/Icon";

export type SegmentedOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  icon?: IconName;
  /** Nombre accesible cuando la opcion solo muestra un icono. */
  title?: string;
};

type SegmentedProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  options: SegmentedOption<V>[];
  /** Nombre accesible del grupo. */
  label: string;
  /** "tabs" para cambiar de panel, "radio" para elegir un valor. */
  semantics?: "radio" | "tabs";
  size?: "sm" | "md";
  className?: string;
};

/**
 * Control segmentado. Sigue el patron de teclado de radios y pestanas: una
 * sola parada de tabulador y flechas para moverse entre opciones.
 */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  semantics = "radio",
  size = "md",
  className = "",
}: SegmentedProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const isTabs = semantics === "tabs";

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = options.findIndex((option) => option.value === value);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const height = size === "sm" ? "h-7 text-xs" : "h-8 text-[0.8125rem]";

  return (
    <div
      role={isTabs ? "tablist" : "radiogroup"}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role={isTabs ? "tab" : "radio"}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            aria-label={option.title}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-medium transition-colors ${height} ${
              selected
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--ink)/0.08)] ring-1 ring-line"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {option.icon && <Icon name={option.icon} className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
