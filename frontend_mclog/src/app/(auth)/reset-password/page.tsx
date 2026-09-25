"use client";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { PasswordInput } from "@/components/molecules/PasswordInput";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { Dictionary } from "@/common/i18n/dictionaries";
import { useResetPassword } from "@/hooks/useAuth";
import { PASSWORD_MIN_LENGTH } from "@/hooks/useUsers";

/** El enlace ya no sirve: hay que pedir otro. El resto de fallos permiten reintentar. */
const isInvalidLink = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 400 && /reset link/i.test(String(error.response.data?.error));

const messageFor = (error: unknown, t: Dictionary): string => {
  if (!axios.isAxiosError(error)) return t.auth.serverError;
  if (!error.response) return t.auth.networkError;
  if (error.response.status === 429) return t.auth.tooManyAttempts;
  if (isInvalidLink(error)) return t.auth.reset.invalid;
  return t.auth.serverError;
};

/**
 * Destino del enlace del correo. El token se lee de la URL y se quita de ella
 * en cuanto se carga la pagina: asi no queda en el historial ni en una captura
 * de pantalla de la barra de direcciones.
 *
 * Tambien activa las cuentas invitadas (`&invite=1`): es el mismo enlace de un
 * solo uso, solo cambian los textos.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  // undefined: aun sin leer la URL (primer render, tambien en el servidor).
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [invite, setInvite] = useState(false);
  const reset = useResetPassword();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("token");
    // Un segundo paso del efecto (Strict Mode) ya no ve el token en la URL: no debe pisar el que se leyo.
    setToken((current) => current ?? fromUrl);
    if (params.get("invite") === "1") setInvite(true);
    if (fromUrl) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const copy = invite ? { ...t.auth.reset, ...t.auth.invite } : t.auth.reset;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (password !== repeated) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    try {
      await reset.mutateAsync({ token, password });
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  if (reset.isSuccess) {
    return (
      <AuthLayout title={copy.title}>
        <div className="flex flex-col gap-5">
          <Alert variant="success">{copy.done}</Alert>
          <ButtonLink href="/" variant="primary" size="lg" iconRight="arrowRight" className="w-full">
            {t.auth.reset.goToSignIn}
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  if (token === null || isInvalidLink(reset.error)) {
    return (
      <AuthLayout title={copy.title}>
        <div className="flex flex-col gap-5">
          <Alert variant="error">{copy.invalid}</Alert>
          {!invite && (
            <ButtonLink href="/forgot-password" variant="primary" size="lg" className="w-full">
              {t.auth.reset.requestNew}
            </ButtonLink>
          )}
          <ButtonLink href="/" variant="ghost" icon="arrowLeft" className="self-center">
            {t.auth.backToSignIn}
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  const pending = reset.isPending;

  return (
    <AuthLayout title={copy.title} subtitle={copy.subtitle}>
      <form className="flex flex-col gap-5" onSubmit={submit} aria-busy={pending}>
        <Field
          label={copy.password}
          hint={t.auth.reset.hint(PASSWORD_MIN_LENGTH)}
          info={t.fieldInfo.auth.resetPassword(PASSWORD_MIN_LENGTH)}
        >
          <PasswordInput
            icon="key"
            size="lg"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending || !token}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            autoFocus
            required
          />
        </Field>
        <Field
          label={copy.repeat}
          error={mismatch ? t.auth.reset.mismatch : undefined}
          info={t.fieldInfo.auth.resetRepeat}
        >
          <PasswordInput
            icon="key"
            size="lg"
            value={repeated}
            onChange={(event) => setRepeated(event.target.value)}
            disabled={pending || !token}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            invalid={mismatch}
            required
          />
        </Field>
        {reset.isError && <Alert variant="error">{messageFor(reset.error, t)}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!token} className="mt-1 w-full">
          {copy.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
