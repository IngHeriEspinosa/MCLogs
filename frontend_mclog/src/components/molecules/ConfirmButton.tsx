"use client";
import React, { useEffect, useRef, useState } from "react";

type Props = {
  onConfirm: () => void;
  children: React.ReactNode;
  /** Texto del segundo clic. Debe decir que va a pasar, no solo "confirmar". */
  confirmLabel: string;
  disabled?: boolean;
  pending?: boolean;
};

/**
 * Accion destructiva en dos pasos.
 *
 * Se usa esto en lugar de `window.confirm` porque el dialogo nativo bloquea el
 * hilo, no se puede estilar y algunos navegadores lo suprimen. Si no se
 * confirma en unos segundos, el boton vuelve solo a su estado inicial para no
 * quedarse armado a la espera de un clic despistado.
 */
export const ConfirmButton: React.FC<Props> = ({ onConfirm, children, confirmLabel, disabled, pending }) => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        armed
          ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
          : "border-slate-200 text-slate-700 hover:border-red-300 hover:text-red-700"
      }`}
    >
      {pending ? "..." : armed ? confirmLabel : children}
    </button>
  );
};
