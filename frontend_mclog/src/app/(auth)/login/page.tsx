"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, IconButton } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useLogin } from "@/hooks/useAuth";

export default function LoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const login = useLogin();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      // El guard del panel manda aqui con ?next= para devolver a la pagina que
      // se pidio. Solo se acepta una ruta interna: un destino absoluto seria
      // una redireccion abierta hacia otro dominio.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next?.startsWith("/") && !next.startsWith("//") ? next : "/logs";
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  const pending = login.isPending;

  return (
    <AuthLayout title={t.auth.signIn} subtitle={t.auth.subtitle}>
      <form className="flex flex-col gap-5" onSubmit={submit} aria-busy={pending}>
        <Field label={t.auth.email}>
          <Input
            type="email"
            icon="mail"
            size="lg"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            autoComplete="email"
            autoFocus
            required
          />
        </Field>
        <Field label={t.auth.password}>
          <Input
            type={visible ? "text" : "password"}
            icon="lock"
            size="lg"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            autoComplete="current-password"
            required
            trailing={
              <IconButton
                icon={visible ? "eyeOff" : "eye"}
                label={visible ? t.auth.hidePassword : t.auth.showPassword}
                size="sm"
                onClick={() => setVisible((current) => !current)}
              />
            }
          />
        </Field>
        {login.isError && <Alert variant="error">{t.auth.invalid}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={pending} iconRight="arrowRight" className="mt-1 w-full">
          {t.auth.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
