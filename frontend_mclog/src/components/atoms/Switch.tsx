import React, { useId } from "react";
import { InfoTip } from "@/components/molecules/InfoTip";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nombre accesible. Se muestra salvo con `hideLabel`. */
  label: string;
  description?: React.ReactNode;
  /** Explicacion detallada, en el icono de informacion junto a la etiqueta visible. */
  info?: React.ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
  size?: "sm" | "md";
};

/**
 * Interruptor de encendido/apagado. Es un <button role="switch">, y la
 * etiqueta visible es un <label for> de ese boton: pulsar el texto tambien
 * lo cambia, como en una casilla.
 */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, description, info, disabled, hideLabel, size = "md" }) => {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const thumb = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-3" : "translate-x-4";

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${track} ${
        checked ? "bg-brand-solid" : "bg-line-strong"
      }`}
    >
      <span
        aria-hidden
        className={`rounded-full bg-white shadow-sm transition-transform duration-200 ${thumb} ${checked ? shift : "translate-x-0"}`}
      />
    </button>
  );

  if (hideLabel) return control;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <label htmlFor={id} className={`text-sm font-medium text-ink ${disabled ? "" : "cursor-pointer"}`}>
            {label}
          </label>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </span>
        {description && (
          <span id={descriptionId} className="text-xs leading-relaxed text-ink-3">
            {description}
          </span>
        )}
      </div>
      <div className="pt-0.5">{control}</div>
    </div>
  );
};
