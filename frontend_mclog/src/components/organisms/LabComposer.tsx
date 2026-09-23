"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Icon } from "@/components/atoms/Icon";
import { Input, Textarea } from "@/components/atoms/Input";
import { LEVEL_FILL, LEVELS } from "@/components/atoms/LevelBadge";
import { Segmented } from "@/components/atoms/Segmented";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { Select } from "@/components/molecules/Select";
import { errorMessage } from "@/common/api/errorMessage";
import { API_BASE } from "@/config/api";
import { useI18n } from "@/common/i18n/I18nProvider";
import { LAB_PREFIX, LabEnvironment, LabLevel, LabLog } from "@/common/lab/scenarios";
import { useSendLabLog } from "@/hooks/useLab";
import { ENVIRONMENTS } from "@/hooks/useOptions";

/** 32 caracteres hex, el formato de traceId que usan los clientes de MCLog. */
const newTraceId = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Metadata vacia es valida; si hay texto, tiene que ser un objeto JSON. */
const parseMetadata = (text: string): { value?: Record<string, unknown>; invalid: boolean } => {
  if (!text.trim()) return { invalid: false };
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value: value as Record<string, unknown>, invalid: false }
      : { invalid: true };
  } catch {
    return { invalid: true };
  }
};

/** Comilla simple para shell: la unica forma de meter una ' es cerrarla y escaparla. */
const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

type LabComposerProps = { environment: LabEnvironment };

/**
 * Compositor de un log a medida. La vista previa muestra exactamente lo que se
 * envia, en JSON y como cURL con API key: sirve tambien de chuleta para
 * integrar una aplicacion nueva.
 *
 * La aplicacion lleva siempre el prefijo `lab-`, para que la limpieza del Lab
 * la alcance igual que a los escenarios.
 */
export const LabComposer: React.FC<LabComposerProps> = ({ environment: defaultEnvironment }) => {
  const { t } = useI18n();
  const send = useSendLabLog();
  const [application, setApplication] = useState("custom");
  const [service, setService] = useState("api");
  const [level, setLevel] = useState<LabLevel>("error");
  const [environment, setEnvironment] = useState<LabEnvironment>(defaultEnvironment);
  const [message, setMessage] = useState("");
  const [traceId, setTraceId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [errorName, setErrorName] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [errorStack, setErrorStack] = useState("");
  const [metadataText, setMetadataText] = useState("");
  const [view, setView] = useState<"json" | "curl">("json");
  const [touched, setTouched] = useState(false);
  // El origen solo existe en el navegador; leerlo al renderizar descuadraria
  // la hidratacion del bloque de cURL.
  const [origin, setOrigin] = useState(API_BASE);

  useEffect(() => setEnvironment(defaultEnvironment), [defaultEnvironment]);
  useEffect(() => setOrigin(API_BASE || window.location.origin), []);

  const metadata = parseMetadata(metadataText);
  const suffix = application.trim().replace(/^lab-/, "") || "custom";

  // Solo los campos rellenos: es lo que haria una integracion real.
  const payload: LabLog = useMemo(() => {
    const log: LabLog = {
      application: `${LAB_PREFIX}${suffix}`,
      level,
      environment,
      message: message.trim() || t.lab.composer.messagePlaceholder,
    };
    if (service.trim()) log.service = service.trim();
    if (traceId.trim()) log.traceId = traceId.trim();
    if (errorName.trim()) log.errorName = errorName.trim();
    if (errorCode.trim()) log.errorCode = errorCode.trim();
    if (errorStack.trim()) log.errorStack = errorStack;
    if (metadata.value) log.metadata = metadata.value;
    return log;
  }, [suffix, level, environment, message, service, traceId, errorName, errorCode, errorStack, metadata.value, t]);

  const json = JSON.stringify(payload, null, 2);
  const curl = [
    `curl -X POST ${shellQuote(`${origin}/api/log`)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'x-api-key: ${t.lab.composer.apiKeyPlaceholder}' \\`,
    `  -d ${shellQuote(JSON.stringify(payload))}`,
  ].join("\n");

  const missingMessage = touched && !message.trim();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!message.trim() || metadata.invalid) return;
    send.mutate({ ...payload, message: message.trim() });
  };

  return (
    <section className="grid min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="flex flex-col gap-5 p-5 3xl:p-6" onSubmit={submit} noValidate>
        <div>
          <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{t.lab.composer.title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{t.lab.composer.description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.lab.composer.application} info={t.fieldInfo.lab.application}>
            <div className="flex items-center">
              <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-line bg-surface-2 px-2.5 font-mono text-[0.8125rem] text-ink-3">
                {LAB_PREFIX}
              </span>
              <Input
                value={application}
                onChange={(event) => setApplication(event.target.value)}
                className="rounded-l-none font-mono"
                wrapperClassName="flex-1"
                maxLength={100}
              />
            </div>
          </Field>
          <Field label={t.lab.composer.service} aside={t.common.optional} info={t.fieldInfo.lab.service}>
            <Input value={service} onChange={(event) => setService(event.target.value)} className="font-mono" maxLength={120} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label={t.lab.composer.level} info={t.fieldInfo.lab.level}>
            <Segmented
              label={t.lab.composer.level}
              value={level}
              onChange={setLevel}
              className="w-full"
              options={LEVELS.map((value) => ({
                value,
                label: (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${LEVEL_FILL[value]}`} />
                    {t.levels.names[value]}
                  </span>
                ),
              }))}
            />
          </Field>
          <Field label={t.lab.composer.environment} info={t.fieldInfo.lab.composerEnvironment}>
            <Select
              icon="layers"
              value={environment}
              onChange={(value) => setEnvironment(value as LabEnvironment)}
              options={ENVIRONMENTS.map((value) => ({ value, label: t.envs.names[value], hint: value }))}
            />
          </Field>
        </div>

        <Field label={t.lab.composer.message} info={t.fieldInfo.lab.message} error={missingMessage ? t.lab.composer.messageRequired : undefined}>
          <Textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.lab.composer.messagePlaceholder}
            className="font-mono text-[0.8125rem]"
            aria-invalid={missingMessage || undefined}
          />
        </Field>

        <Field label={t.lab.composer.traceId} aside={t.common.optional} info={t.fieldInfo.lab.traceId}>
          <Input
            value={traceId}
            onChange={(event) => setTraceId(event.target.value)}
            className="font-mono text-[0.8125rem]"
            maxLength={128}
            trailing={
              <Button size="xs" variant="ghost" icon="refresh" onClick={() => setTraceId(newTraceId())}>
                {t.lab.composer.generate}
              </Button>
            }
          />
        </Field>

        <div className="rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-[0.8125rem] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {t.lab.composer.advanced}
            <Icon name={advanced ? "chevronUp" : "chevronDown"} className="h-4 w-4 text-ink-3" />
          </button>
          {advanced && (
            <div className="flex flex-col gap-4 border-t border-line p-3.5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field label={t.lab.composer.errorName} info={t.fieldInfo.lab.errorName}>
                  <Input value={errorName} onChange={(event) => setErrorName(event.target.value)} className="font-mono" placeholder="TimeoutError" />
                </Field>
                <Field label={t.lab.composer.errorCode} info={t.fieldInfo.lab.errorCode}>
                  <Input value={errorCode} onChange={(event) => setErrorCode(event.target.value)} className="font-mono" placeholder="ETIMEDOUT" />
                </Field>
              </div>
              <Field label={t.lab.composer.errorStack} info={t.fieldInfo.lab.errorStack}>
                <Textarea
                  rows={4}
                  value={errorStack}
                  onChange={(event) => setErrorStack(event.target.value)}
                  className="font-mono text-xs"
                  placeholder={"TimeoutError: Payment provider did not answer\n    at PaymentClient.charge (/app/src/payments.ts:58:15)"}
                />
              </Field>
              <Field
                label={t.lab.composer.metadata}
                info={t.fieldInfo.lab.metadata}
                hint={t.lab.composer.metadataHint}
                error={metadata.invalid ? t.lab.composer.metadataInvalid : undefined}
              >
                <Textarea
                  rows={4}
                  value={metadataText}
                  onChange={(event) => setMetadataText(event.target.value)}
                  className="font-mono text-xs"
                  placeholder={'{ "orderId": "ORD-10421", "attempt": 2 }'}
                  aria-invalid={metadata.invalid || undefined}
                />
              </Field>
            </div>
          )}
        </div>

        {send.isError && <Alert variant="error">{errorMessage(send.error, t.common.unknownError)}</Alert>}
        {send.isSuccess && (
          <Alert
            variant="success"
            action={
              <ButtonLink
                size="xs"
                variant="ghost"
                iconRight="arrowRight"
                href={`/logs?range=15m&application=${encodeURIComponent(payload.application)}`}
              >
                {t.lab.composer.viewSent}
              </ButtonLink>
            }
          >
            {t.lab.composer.sent(String(send.data.id))}
          </Alert>
        )}

        <Button type="submit" variant="primary" icon="send" loading={send.isPending} disabled={metadata.invalid}>
          {t.lab.composer.send}
        </Button>
      </form>

      <div className="flex min-w-0 flex-col gap-3 border-t border-line bg-surface-2 p-5 xl:border-l xl:border-t-0 3xl:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{t.lab.composer.request}</p>
          <Segmented
            size="sm"
            semantics="tabs"
            label={t.lab.composer.request}
            value={view}
            onChange={setView}
            options={[
              { value: "json", label: t.lab.composer.json, icon: "braces" },
              { value: "curl", label: t.lab.composer.curl, icon: "code" },
            ]}
          />
        </div>
        <p className="font-mono text-xs text-ink-3">
          POST {origin}/api/log
        </p>
        <CodeBlock code={view === "json" ? json : curl} language={view === "json" ? "json" : "text"} maxHeight="28rem" />
        {view === "curl" && <p className="text-xs text-ink-3">{t.lab.composer.curlHint}</p>}
      </div>
    </section>
  );
};
