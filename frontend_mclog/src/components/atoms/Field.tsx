import React, { useId } from "react";

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Texto pequeno junto a la etiqueta, p. ej. "Opcional". */
  aside?: React.ReactNode;
  className?: string;
  /** Un unico control. Field le pone el id y el aria-describedby. */
  children: React.ReactElement;
};

/**
 * Etiqueta, control y ayuda como una sola pieza.
 *
 * Asocia la etiqueta y la ayuda al control por id en lugar de envolverlo en
 * <label>: asi funciona tambien con los selects propios, que son botones.
 */
export const Field: React.FC<FieldProps> = ({ label, hint, error, aside, className = "", children }) => {
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
        <label htmlFor={children.props.id ?? id} className="text-[0.8125rem] font-medium text-ink">
          {label}
        </label>
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

/** Grupo de controles con leyenda (casillas, opciones). */
export const Fieldset: React.FC<{ legend: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  legend,
  hint,
  children,
  className = "",
}) => (
  <fieldset className={`flex flex-col gap-2 ${className}`}>
    <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">{legend}</legend>
    {children}
    {hint && <p className="text-xs leading-relaxed text-ink-3">{hint}</p>}
  </fieldset>
);
