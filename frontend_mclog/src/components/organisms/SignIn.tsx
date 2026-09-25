"use client";
// Organism: SignIn (pantalla de acceso, en "/" y en su alias "/login")
import React, { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Spinner } from "@/components/atoms/Spinner";
import { PasswordInput } from "@/components/molecules/PasswordInput";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { Dictionary } from "@/common/i18n/dictionaries";
import { useLogin, useLoginSecondFactor, useMe } from "@/hooks/useAuth";

/**
 * Traduce el fallo del login al mensaje que corresponde.
 *
 * La distincion importante es la ausencia de `response`: cuando el navegador no
 * llega a recibir una respuesta —CORS mal configurado, DNS, backend caido— axios
 * no puede decir mas, y todos esos casos son indistinguibles desde JavaScript.
 * Presentarlos como "credenciales invalidas" manda a buscar el fallo al lado
 * equivocado, asi que se nombran como problema de conexion.
 */
const messageFor = (error: unknown, t: Dictionary): string => {
  if (!axios.isAxiosError(error)) return t.auth.serverError;
  if (!error.response) return t.auth.networkError;
  const status = error.response.status;
  if (status === 401) return t.auth.invalid;
  if (status === 429) return t.auth.tooManyAttempts;
  return t.auth.serverError;
};

/** Fallo del segundo paso: un token intermedio caducado obliga a volver a la contrasena. */
const secondFactorMessage = (error: unknown, t: Dictionary): string => {
  if (!axios.isAxiosError(error)) return t.auth.serverError;
  if (!error.response) return t.auth.networkError;
  if (error.response.status === 429) return t.auth.tooManyAttempts;
  if (error.response.status === 401) {
    return /expired sign-in/i.test(String(error.response.data?.error)) ? t.auth.twoFactorExpired : t.auth.twoFactorInvalid;
  }
  return t.auth.serverError;
};

/** Destino tras entrar. Solo se acepta una ruta interna: un destino absoluto seria una redireccion abierta. */
const destination = () => {
  // El guard del panel manda aqui con ?next= para devolver a la pagina que se pidio.
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) return next;
  // Antes "/" era la vista de logs: sus enlaces con filtros (?level=error,
  // ?fingerprint=…) siguen llevando a Logs con esos filtros.
  params.delete("next");
  const legacy = params.toString();
  return legacy ? `/logs?${legacy}` : "/logs";
};

const redirectAfterLogin = () => {
  window.location.href = destination();
};

export const SignIn: React.FC = () => {
  const { t } = useI18n();
  const me = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const secondFactor = useLoginSecondFactor();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await login.mutateAsync({ email, password });
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        return;
      }
      redirectAfterLogin();
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mfaToken) return;
    try {
      await secondFactor.mutateAsync({ mfaToken, code: code.trim() });
      redirectAfterLogin();
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  const backToPassword = () => {
    setMfaToken(null);
    setCode("");
    setPassword("");
    secondFactor.reset();
  };

  // Con sesion abierta el formulario no aporta nada: se entra directo al panel.
  // Mientras se comprueba no se pinta, para no enseñarlo un instante a quien
  // ya ha entrado.
  useEffect(() => {
    if (me.isSuccess) window.location.replace(destination());
  }, [me.isSuccess]);

  if (me.isPending || me.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-3">
        <Spinner className="h-6 w-6" label={t.common.loading} />
      </div>
    );
  }

  if (mfaToken) {
    const verifying = secondFactor.isPending;
    return (
      <AuthLayout title={t.auth.twoFactorTitle} subtitle={t.auth.twoFactorSubtitle}>
        <form className="flex flex-col gap-5" onSubmit={submitCode} aria-busy={verifying}>
          <Field label={t.auth.twoFactorCode} hint={t.auth.twoFactorHint} info={t.fieldInfo.auth.twoFactorCode}>
            <Input
              icon="shield"
              size="lg"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={verifying}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="font-mono tracking-[0.3em]"
              autoFocus
              required
            />
          </Field>
          {secondFactor.isError && <Alert variant="error">{secondFactorMessage(secondFactor.error, t)}</Alert>}
          <Button type="submit" variant="primary" size="lg" loading={verifying} iconRight="arrowRight" className="mt-1 w-full">
            {t.auth.verify}
          </Button>
          <Button variant="ghost" icon="arrowLeft" onClick={backToPassword} disabled={verifying} className="self-center">
            {t.auth.backToLogin}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  const pending = login.isPending;

  return (
    <AuthLayout title={t.auth.signIn} subtitle={t.auth.subtitle}>
      <form className="flex flex-col gap-5" onSubmit={submit} aria-busy={pending}>
        <Field label={t.auth.email} info={t.fieldInfo.auth.email}>
          <Input
            type="email"
            icon="mail"
            size="lg"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            autoComplete="email"
            placeholder={t.auth.emailPlaceholder}
            autoFocus
            required
          />
        </Field>
        <Field
          label={t.auth.password}
          info={t.fieldInfo.auth.password}
          aside={
            <Link href="/forgot-password" className="font-medium text-brand hover:underline">
              {t.auth.forgotLink}
            </Link>
          }
        >
          <PasswordInput
            icon="lock"
            size="lg"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            autoComplete="current-password"
            placeholder={t.auth.passwordPlaceholder}
            required
          />
        </Field>
        {login.isError && <Alert variant="error">{messageFor(login.error, t)}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={pending} iconRight="arrowRight" className="mt-1 w-full">
          {t.auth.submit}
        </Button>
      </form>
    </AuthLayout>
  );
};
