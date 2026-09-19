// Atom: PrimaryButton (acción primaria)
import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export const PrimaryButton: React.FC<ButtonProps> = ({ loading, children, className = "", ...rest }) => (
  <button
    className={`inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 ${className}`}
    disabled={loading || rest.disabled}
    {...rest}
  >
    {loading ? "Cargando..." : children}
  </button>
);
