"use client";
import React, { forwardRef, useState } from "react";
import { IconButton } from "@/components/atoms/Button";
import { Input, InputProps } from "@/components/atoms/Input";
import { useI18n } from "@/common/i18n/I18nProvider";

type PasswordInputProps = Omit<InputProps, "type" | "trailing">;

/** Campo de contrasena con un boton para ver lo escrito antes de enviarlo. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(props, ref) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <IconButton
          icon={visible ? "eyeOff" : "eye"}
          label={visible ? t.auth.hidePassword : t.auth.showPassword}
          size="sm"
          // En un campo pequeno el boton no cabe con su alto normal.
          className={props.size === "sm" ? "!h-6 !w-6" : ""}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        />
      }
    />
  );
});
