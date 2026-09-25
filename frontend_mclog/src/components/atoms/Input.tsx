import React, { forwardRef } from "react";
import { Icon, IconName } from "@/components/atoms/Icon";

type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, string> = {
  sm: "h-8 text-[0.8125rem]",
  md: "h-9",
  lg: "h-11 text-[0.9375rem]",
};

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  icon?: IconName;
  /** Contenido al final del campo: un atajo de teclado, un boton de limpiar... */
  trailing?: React.ReactNode;
  size?: Size;
  invalid?: boolean;
  wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, trailing, size = "md", invalid, className = "", wrapperClassName = "", ...rest },
  ref,
) {
  return (
    <div className={`relative flex items-center ${wrapperClassName}`}>
      {icon && (
        <Icon name={icon} className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" />
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`field-base ${HEIGHT[size]} ${icon ? "pl-9" : "pl-3"} ${trailing ? "pr-10" : "pr-3"} ${
          invalid ? "border-danger focus:border-danger focus:ring-danger/15" : ""
        } ${className}`}
        {...rest}
      />
      {trailing && <div className="absolute right-1.5 flex items-center">{trailing}</div>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={`field-base resize-y px-3 py-2 leading-relaxed ${className}`} {...rest} />;
  },
);
