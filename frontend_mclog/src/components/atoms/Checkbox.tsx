import React, { useId } from "react";
import { Icon } from "@/components/atoms/Icon";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  /**
   * "card" enmarca la opcion; util cuando cada opcion lleva descripcion.
   * "chip" es una pastilla compacta para listas de opciones cortas; su
   * descripcion no se ve, pero la anuncia el lector y sale al pasar el raton.
   */
  variant?: "plain" | "card" | "chip";
  className?: string;
};

/** Pastilla: el icono (marca o "+") dice el estado ademas del color. */
const Chip: React.FC<Omit<CheckboxProps, "variant">> = ({ checked, onChange, label, description, disabled, className = "" }) => {
  const descriptionId = useId();
  return (
    <>
      <label
        title={typeof description === "string" ? description : undefined}
        className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border py-1 pl-2 pr-3 text-[0.8125rem] font-medium leading-5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[rgb(var(--focus))] ${
          checked
            ? "border-brand/50 bg-brand-soft text-brand-ink"
            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Icon name={checked ? "check" : "plus"} className="h-3.5 w-3.5 shrink-0" strokeWidth={checked ? 3 : 2} />
        {label}
      </label>
      {/* Fuera del <label>: dentro se sumaria al nombre de la casilla. */}
      {description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
    </>
  );
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
}) =>
  variant === "chip" ? (
    <Chip checked={checked} onChange={onChange} label={label} description={description} disabled={disabled} className={className} />
  ) : (
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
