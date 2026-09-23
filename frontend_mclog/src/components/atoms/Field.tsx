import React, { useId } from "react";
import { InfoTip } from "@/components/molecules/InfoTip";

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Texto pequeno junto a la etiqueta, p. ej. "Opcional". */
  aside?: React.ReactNode;
  /** Explicacion detallada del campo, en el icono de informacion junto a la etiqueta. */
  info?: React.ReactNode;
  className?: string;
  /** Un unico control. Field le pone el id y el aria-describedby. */
  children: React.ReactElement;
};

/**
 * Etiqueta, control y ayuda como una sola pieza.
 *
 * Asocia la etiqueta y la ayuda al control por id en lugar de envolverlo en
 * <label>: asi funciona tambien con los selects propios, que son botones.
 *
 * El icono de informacion va fuera del <label>: dentro, pulsarlo enfocaria el
 * control y su texto se sumaria al nombre accesible del campo.
 */
export const Field: React.FC<FieldProps> = ({ label, hint, error, aside, info, className = "", children }) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: children.props.id ?? id,
    "aria-describedby": children.props["aria-describedby"] ?? describedBy,
  });

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <label htmlFor={children.props.id ?? id} className="text-[0.8125rem] font-medium text-ink">
            {label}
          </label>
          {info && <InfoTip label={typeof label === "string" ? label : undefined}>{info}</InfoTip>}
        </span>
        {aside && <span className="text-xs text-ink-3">{aside}</span>}
      </div>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * Grupo de controles con leyenda (casillas, opciones).
 *
 * El nombre del grupo sale solo del texto de la leyenda (aria-labelledby): el
 * icono de informacion que va dentro no debe sumarse a el.
 */
export const Fieldset: React.FC<{
  legend: React.ReactNode;
  hint?: React.ReactNode;
  /** Explicacion detallada del grupo, en el icono de informacion junto a la leyenda. */
  info?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ legend, hint, info, children, className = "" }) => {
  const legendId = useId();
  return (
    <fieldset aria-labelledby={legendId} className={`flex flex-col gap-2 ${className}`}>
      <legend className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink">
        <span id={legendId}>{legend}</span>
        {info && <InfoTip label={typeof legend === "string" ? legend : undefined}>{info}</InfoTip>}
      </legend>
      {children}
      {hint && <p className="text-xs leading-relaxed text-ink-3">{hint}</p>}
    </fieldset>
  );
};
