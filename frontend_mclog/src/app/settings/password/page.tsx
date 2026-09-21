"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { LOCALES, Locale } from "@/common/i18n/config";
import { useI18n } from "@/common/i18n/I18nProvider";
import { ThemePreference } from "@/common/theme/config";
import { useTheme } from "@/common/theme/ThemeProvider";
import { useChangePassword, useMe } from "@/hooks/useAuth";
import { PASSWORD_MIN_LENGTH } from "@/hooks/useUsers";

export default function AccountPage() {
  const { t, fmt, locale, setLocale } = useI18n();
  const { preference, setPreference } = useTheme();
  const me = useMe();
  const change = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (newPassword !== repeated) {
      setLocalError(t.account.mismatch);
      return;
    }

    await change.mutateAsync({ currentPassword, newPassword });
    setDone(true);
    setCurrentPassword("");
    setNewPassword("");
    setRepeated("");

    // El backend revoca todos los refresh tokens, incluido el de esta sesion,
    // asi que hay que volver a entrar. Se deja leer el mensaje antes de salir.
    setTimeout(() => {
      window.location.href = "/login";
    }, 2500);
  };

  return (
    <DashboardLayout title={t.account.title} eyebrow={t.account.eyebrow} description={t.account.description} width="narrow">
      <div className="grid items-start gap-4 lg:grid-cols-2 3xl:gap-5">
        <div className="flex flex-col gap-4 3xl:gap-5">
          <Card title={t.account.session} divider>
            {me.isLoading ? (
              <Skeleton className="h-14 w-full" />
            ) : (
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-solid font-heading text-lg font-semibold text-white">
                  {me.data?.email.charAt(0).toUpperCase() ?? "?"}
                </span>
                <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-ink-3">{t.account.email}</dt>
                  <dd className="truncate font-medium text-ink">{me.data?.email ?? "—"}</dd>
                  <dt className="text-ink-3">{t.account.role}</dt>
                  <dd>{me.data && <Tag tone={me.data.role === "admin" ? "brand" : "neutral"}>{t.nav.roles[me.data.role]}</Tag>}</dd>
                  <dt className="text-ink-3">{t.account.memberSince}</dt>
                  <dd className="text-ink-2">{me.data ? fmt.date(me.data.createdAt) : "—"}</dd>
                </dl>
              </div>
            )}
          </Card>

          <Card title={t.account.preferences} description={t.account.preferencesHint} divider>
            <div className="flex flex-col gap-5">
              <Field label={t.prefs.theme}>
                <Segmented
                  label={t.prefs.theme}
                  value={preference}
                  onChange={(value) => setPreference(value as ThemePreference)}
                  className="w-full"
                  options={[
                    { value: "light", label: t.prefs.themes.light, icon: "sun" },
                    { value: "dark", label: t.prefs.themes.dark, icon: "moon" },
                    { value: "system", label: t.prefs.themes.system, icon: "monitor" },
                  ]}
                />
              </Field>
              <Field label={t.prefs.language}>
                <Segmented
                  label={t.prefs.language}
                  value={locale}
                  onChange={(value) => setLocale(value as Locale)}
                  className="w-full"
                  options={LOCALES.map((option) => ({ value: option, label: t.prefs.languages[option], icon: "globe" }))}
                />
              </Field>
            </div>
          </Card>
        </div>

        <Card title={t.account.changePassword} description={t.account.note} divider>
          <form className="flex flex-col gap-5" onSubmit={submit}>
            <Field label={t.account.current}>
              <Input
                type="password"
                icon="lock"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label={t.account.next} hint={t.account.nextHint(PASSWORD_MIN_LENGTH)}>
              <Input
                type="password"
                icon="key"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label={t.account.repeat} error={localError ?? undefined}>
              <Input
                type="password"
                icon="key"
                value={repeated}
                onChange={(event) => setRepeated(event.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                invalid={!!localError}
                required
              />
            </Field>

            {change.isError && <Alert variant="error">{errorMessage(change.error, t.common.unknownError)}</Alert>}
            {done && <Alert variant="success">{t.account.done}</Alert>}

            <Button type="submit" variant="primary" icon="check" loading={change.isPending} disabled={done}>
              {t.account.changePassword}
            </Button>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
