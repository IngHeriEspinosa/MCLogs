"use client";
import React, { useState } from "react";
import axios from "axios";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { Dictionary } from "@/common/i18n/dictionaries";
import { useForgotPassword } from "@/hooks/useAuth";

const messageFor = (error: unknown, t: Dictionary): { variant: "error" | "warning"; text: string } => {
  if (!axios.isAxiosError(error)) return { variant: "error", text: t.auth.serverError };
  if (!error.response) return { variant: "error", text: t.auth.networkError };
  if (error.response.status === 503) return { variant: "warning", text: t.auth.forgot.unavailable };
  if (error.response.status === 429) return { variant: "error", text: t.auth.forgot.tooMany };
  return { variant: "error", text: t.auth.serverError };
};

/**
 * Peticion del enlace para restablecer la contrasena. La confirmacion no dice
 * si la cuenta existe: el backend responde igual en ambos casos.
 */
export default function ForgotPasswordPage() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const forgot = useForgotPassword();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await forgot.mutateAsync({ email: email.trim(), locale });
      setSentTo(email.trim());
    } catch {
      // el estado de error de la mutación muestra el mensaje
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title={t.auth.forgot.sentTitle}>
        <div className="flex flex-col gap-5">
          <Alert variant="success">{t.auth.forgot.sent(sentTo)}</Alert>
          <ButtonLink href="/login" variant="primary" size="lg" icon="arrowLeft" className="w-full">
            {t.auth.backToSignIn}
          </ButtonLink>
          <Button
            variant="ghost"
            onClick={() => {
              setSentTo(null);
              forgot.reset();
            }}
            className="self-center"
          >
            {t.auth.forgot.again}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const pending = forgot.isPending;
  const failure = forgot.isError ? messageFor(forgot.error, t) : null;

  return (
    <AuthLayout title={t.auth.forgot.title} subtitle={t.auth.forgot.subtitle}>
      <form className="flex flex-col gap-5" onSubmit={submit} aria-busy={pending}>
        <Field label={t.auth.email} info={t.fieldInfo.auth.forgotEmail}>
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
        {failure && <Alert variant={failure.variant}>{failure.text}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={pending} iconRight="arrowRight" className="mt-1 w-full">
          {t.auth.forgot.submit}
        </Button>
        <ButtonLink href="/login" variant="ghost" icon="arrowLeft" className="self-center">
          {t.auth.backToSignIn}
        </ButtonLink>
      </form>
    </AuthLayout>
  );
}
