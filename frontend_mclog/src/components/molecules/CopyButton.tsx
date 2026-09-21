"use client";
import React, { useEffect, useRef, useState } from "react";
import { Button, ButtonSize, ButtonVariant, IconButton } from "@/components/atoms/Button";
import { IconName } from "@/components/atoms/Icon";
import { useToast } from "@/components/molecules/Toast";
import { copyText } from "@/common/clipboard";
import { useI18n } from "@/common/i18n/I18nProvider";

type CopyButtonProps = {
  /** Texto a copiar, o funcion que lo construye (puede ser asincrona). */
  text: string | (() => string | Promise<string>);
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mensaje del aviso al copiar; por defecto, "Copiado al portapapeles". */
  toast?: string | false;
  className?: string;
};

/** Boton de copiar con confirmacion visible durante un momento. */
export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  icon = "copy",
  iconOnly,
  variant = "secondary",
  size = "sm",
  toast,
  className = "",
}) => {
  const { t } = useI18n();
  const notify = useToast();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    setState("busy");
    try {
      const value = typeof text === "function" ? await text() : text;
      const ok = await copyText(value);
      if (!ok) throw new Error("clipboard");
      setState("done");
      if (toast !== false) notify(toast ?? t.toast.copied);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("idle");
      notify(t.toast.copyFailed, "error");
    }
  };

  const currentIcon: IconName = state === "done" ? "check" : icon;

  if (iconOnly) {
    return (
      <IconButton
        icon={currentIcon}
        label={state === "done" ? t.common.copied : label}
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={state === "busy"}
        className={className}
      />
    );
  }

  return (
    <Button variant={variant} size={size} icon={currentIcon} loading={state === "busy"} onClick={onClick} className={className}>
      {state === "done" ? t.common.copied : label}
    </Button>
  );
};
