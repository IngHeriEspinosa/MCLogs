import React from "react";
import { Icon } from "@/components/atoms/Icon";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  /** "card" enmarca la opcion; util cuando cada opcion lleva descripcion. */
  variant?: "plain" | "card";
  className?: string;
};

/**
 * Casilla con el input nativo por debajo (sr-only): teclado, lector de
 * pantalla y envio de formularios funcionan igual que con una casilla normal.
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled,
  variant = "plain",
  className = "",
}) => (
  <label
    className={`group flex cursor-pointer items-start gap-3 ${
      variant === "card"
        ? `rounded-xl border px-3.5 py-3 transition-colors ${
            checked ? "border-brand/50 bg-brand-soft/50" : "border-line bg-surface hover:border-line-strong"
          }`
        : ""
    } ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
  >
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span
      aria-hidden
      className={`mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[rgb(var(--focus))] ${
        checked ? "border-brand-solid bg-brand-solid text-white" : "border-line-strong bg-surface group-hover:border-ink-3"
      }`}
    >
      {checked && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
    </span>
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {description && <span className="text-xs leading-relaxed text-ink-3">{description}</span>}
    </span>
  </label>
);
