"use client";
import React, { useEffect, useRef, useState } from "react";
import { Button, ButtonSize } from "@/components/atoms/Button";
import { IconName } from "@/components/atoms/Icon";

type Props = {
  onConfirm: () => void;
  children: React.ReactNode;
  /** Texto del segundo clic. Debe decir que va a pasar, no solo "confirmar". */
  confirmLabel: string;
  disabled?: boolean;
  pending?: boolean;
  icon?: IconName;
  size?: ButtonSize;
};

/**
 * Accion destructiva en dos pasos.
 *
 * Se usa esto en lugar de `window.confirm` porque el dialogo nativo bloquea el
 * hilo, no se puede estilar y algunos navegadores lo suprimen. Si no se
 * confirma en unos segundos, el boton vuelve solo a su estado inicial para no
 * quedarse armado a la espera de un clic despistado.
 */
export const ConfirmButton: React.FC<Props> = ({
  onConfirm,
  children,
  confirmLabel,
  disabled,
  pending,
  icon = "trash",
  size = "sm",
}) => {
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
    <Button
      size={size}
      variant={armed ? "danger" : "ghost"}
      icon={armed ? "alertCircle" : icon}
      onClick={handleClick}
      disabled={disabled}
      loading={pending}
      className={armed ? "" : "hover:bg-danger-soft hover:text-danger"}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
};
