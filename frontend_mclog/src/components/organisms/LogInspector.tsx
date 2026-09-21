"use client";
import React, { useEffect, useRef } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink, IconButton } from "@/components/atoms/Button";
import { LevelBadge, LevelDot } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EnvTag } from "@/components/atoms/Tag";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import type { LogRow } from "@/components/organisms/LogTable";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildLogBrief } from "@/common/reports/build";
import type { LogEntry } from "@/hooks/useAuth";
import { useLogContext } from "@/hooks/useErrors";

type LogInspectorProps = {
  log: LogRow;
  /** "panel" junto a la tabla (pantallas anchas) o "drawer" sobre el contenido. */
  mode: "panel" | "drawer";
  onClose: () => void;
  onSelect: (log: LogEntry) => void;
  onFilterFingerprint: (fingerprint: string) => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Detalle de un log. En pantallas anchas es una columna fija junto a la tabla,
 * asi que se puede recorrer la tabla con las flechas y ver cada detalle sin
 * perder el sitio; en pantallas estrechas se desliza encima como un cajon
 * modal, con el foco atrapado dentro mientras esta abierto.
 */
export const LogInspector: React.FC<LogInspectorProps> = ({ log, mode, onClose, onSelect, onFilterFingerprint }) => {
  const { t, fmt, locale } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const full: LogEntry | null = "streamKey" in log ? null : log;
  const context = useLogContext(full?.id ?? null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // En modo cajon: foco dentro al abrir y de vuelta a donde estaba al cerrar.
  useEffect(() => {
    if (mode !== "drawer") return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, [mode]);

  const trapFocus = (event: React.KeyboardEvent) => {
    if (mode !== "drawer" || event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const origin = new Date(log.timestamp).getTime();
  const formatOffset = (ms: number) => {
    const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
    const abs = Math.abs(ms);
    return `${sign}${abs < 1000 ? `${abs} ms` : `${fmt.decimal(abs / 1000)} s`}`;
  };

  const properties: Array<{ label: string; value: string | null | undefined; mono?: boolean; copy?: boolean }> = [
    { label: t.inspector.fields.application, value: log.application, mono: true },
    { label: t.inspector.fields.service, value: log.service, mono: true },
    { label: t.inspector.fields.host, value: log.host, mono: true },
    { label: t.inspector.fields.traceId, value: log.traceId, mono: true, copy: true },
    { label: t.inspector.fields.spanId, value: full?.spanId, mono: true },
    {
      label: t.inspector.fields.error,
      value: log.errorName ? `${log.errorName}${full?.errorCode ? ` (${full.errorCode})` : ""}` : null,
    },
    { label: t.inspector.fields.fingerprint, value: log.fingerprint, mono: true, copy: true },
    { label: t.inspector.fields.id, value: log.id !== undefined ? String(log.id) : null, mono: true, copy: true },
  ];

  const content = (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2">{t.inspector.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge level={log.level} />
            <EnvTag environment={log.environment} label={t.envs.names[log.environment] ?? log.environment} />
          </div>
          <p className="mt-2 font-mono text-[0.8125rem] tabular-nums text-ink">
            {fmt.date(log.timestamp)} · {fmt.timeSeconds(log.timestamp)}
          </p>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmt.relative(log.timestamp)} · <span className="font-mono">{log.application}</span>
            {log.service && log.service !== log.application && <span className="font-mono"> › {log.service}</span>}
          </p>
        </div>
        <IconButton icon="x" label={t.inspector.close} onClick={onClose} className="-mr-2" />
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        {!full && <Alert variant="info">{t.inspector.liveRow}</Alert>}

        <section>
          <h3 className="eyebrow mb-2">{t.inspector.message}</h3>
          <div className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[0.8125rem] leading-relaxed text-ink">
            {log.message}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {log.traceId && (
            <ButtonLink href={`/trace/${encodeURIComponent(log.traceId)}`} size="sm" icon="route">
              {t.inspector.viewTrace}
            </ButtonLink>
          )}
          {log.fingerprint && (
            <Button size="sm" icon="hash" onClick={() => onFilterFingerprint(log.fingerprint as string)}>
              {t.inspector.similar}
            </Button>
          )}
          <CopyButton text={() => JSON.stringify(log, null, 2)} label={t.inspector.copyJson} icon="braces" />
          {full && (
            <CopyButton
              variant="soft"
              icon="sparkles"
              label={t.inspector.copyAi}
              toast={t.toast.aiCopied}
              text={() => buildLogBrief(full, context.data?.data ?? [], locale)}
            />
          )}
        </div>

        <section>
          <h3 className="eyebrow mb-2">{t.inspector.properties}</h3>
          <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {properties
              .filter((property) => property.value)
              .map((property) => (
                <React.Fragment key={property.label}>
                  <dt className="text-xs leading-6 text-ink-3">{property.label}</dt>
                  <dd className="group/value flex min-w-0 items-center gap-1.5">
                    <span className={`truncate text-ink ${property.mono ? "font-mono text-[0.8125rem]" : ""}`} title={property.value ?? undefined}>
                      {property.value}
                    </span>
                    {property.copy && (
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/value:opacity-100">
                        <CopyButton text={property.value as string} label={`${t.common.copy} ${property.label}`} iconOnly size="xs" variant="ghost" />
                      </span>
                    )}
                  </dd>
                </React.Fragment>
              ))}
          </dl>
        </section>

        {full?.errorStack && (
          <section>
            <h3 className="eyebrow mb-2">{t.inspector.stack}</h3>
            <CodeBlock code={full.errorStack} language="stack" maxHeight="22rem" />
          </section>
        )}

        {full?.metadata && Object.keys(full.metadata).length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">{t.inspector.metadata}</h3>
            <CodeBlock code={JSON.stringify(full.metadata, null, 2)} language="json" maxHeight="22rem" />
          </section>
        )}

        {full && (
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="eyebrow">{t.inspector.context}</h3>
              <span className="text-[0.6875rem] text-ink-3">{t.inspector.contextHint}</span>
            </div>
            {context.isLoading ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))}
              </div>
            ) : context.isError ? (
              <p className="text-sm text-ink-3">{t.inspector.contextError}</p>
            ) : (context.data?.data.length ?? 0) <= 1 ? (
              <p className="text-sm text-ink-3">{t.inspector.contextEmpty}</p>
            ) : (
              <ol className="-mx-2 flex flex-col">
                {context.data?.data.map((entry) => {
                  const target = entry.id === full.id;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        disabled={target}
                        onClick={() => onSelect(entry)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          target ? "bg-brand-soft/70" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className="w-16 shrink-0 text-right font-mono tabular-nums text-ink-3">
                          {formatOffset(new Date(entry.timestamp).getTime() - origin)}
                        </span>
                        <LevelDot level={entry.level} />
                        <span className={`truncate ${target ? "font-medium text-ink" : "text-ink-2"}`}>{entry.message}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>
    </>
  );

  if (mode === "drawer") {
    return (
      <>
        <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 animate-fade-in bg-[rgb(4_10_14/0.45)]" />
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.inspector.title}
          tabIndex={-1}
          onKeyDown={trapFocus}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl animate-slide-in-right flex-col bg-surface shadow-pop outline-none sm:border-l sm:border-line"
        >
          {content}
        </aside>
      </>
    );
  }

  return (
    <aside
      ref={panelRef}
      aria-label={t.inspector.title}
      className="sticky top-[4.5rem] flex max-h-[calc(100vh-5.5rem)] min-w-0 animate-slide-in-right flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
    >
      {content}
    </aside>
  );
};
