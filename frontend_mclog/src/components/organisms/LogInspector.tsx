"use client";
import React, { useEffect, useRef } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink, IconButton } from "@/components/atoms/Button";
import { LevelBadge, LevelDot } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EnvTag } from "@/components/atoms/Tag";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import { InfoTip } from "@/components/molecules/InfoTip";
import type { LogRow } from "@/components/organisms/LogTable";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildLogBrief } from "@/common/reports/build";
import type { LogEntry } from "@/hooks/useAuth";
import { useLogContext } from "@/hooks/useErrors";

type LogInspectorProps = {
  log: LogRow;
  onClose: () => void;
  onSelect: (log: LogEntry) => void;
  onFilterFingerprint: (fingerprint: string) => void;
  /** Recorrer la pagina sin cerrar el detalle. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Posicion en la pagina actual, empezando en 1. */
  position?: { index: number; total: number };
  /**
   * Para una copia (un snapshot): sin contexto, traza ni "similares", que
   * consultarian datos en vivo a los que quien mira puede no tener acceso.
   */
  readOnly?: boolean;
};

/**
 * Detalle de un log en un dialogo modal al 90 % de la pantalla, con el detalle
 * a dos columnas: mensajes, stacks y metadata largos se leen sin recortes, y
 * las flechas recorren la pagina sin cerrarlo.
 */
export const LogInspector: React.FC<LogInspectorProps> = ({
  log,
  onClose,
  onSelect,
  onFilterFingerprint,
  onPrev,
  onNext,
  position,
  readOnly = false,
}) => {
  const { t, fmt, locale } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const full: LogEntry | null = "streamKey" in log ? null : log;
  const context = useLogContext(readOnly ? null : full?.id ?? null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft" && onPrev) onPrev();
      if (event.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, onPrev, onNext]);

  // <dialog> nativo: el navegador atrapa el foco y deja inerte el resto; al
  // cerrar se devuelve a la fila desde la que se abrio.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => previous?.focus?.();
  }, []);

  const origin = new Date(log.timestamp).getTime();
  const formatOffset = (ms: number) => {
    const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
    const abs = Math.abs(ms);
    return `${sign}${abs < 1000 ? `${abs} ms` : `${fmt.decimal(abs / 1000)} s`}`;
  };

  const properties: Array<{ label: string; info: string; value: string | null | undefined; mono?: boolean; copy?: boolean }> = [
    { label: t.inspector.fields.application, info: t.fieldInfo.log.application, value: log.application, mono: true },
    { label: t.inspector.fields.service, info: t.fieldInfo.log.service, value: log.service, mono: true },
    { label: t.inspector.fields.host, info: t.fieldInfo.log.host, value: log.host, mono: true },
    { label: t.inspector.fields.traceId, info: t.fieldInfo.log.traceId, value: log.traceId, mono: true, copy: true },
    { label: t.inspector.fields.spanId, info: t.fieldInfo.log.spanId, value: full?.spanId, mono: true },
    {
      label: t.inspector.fields.error,
      info: t.fieldInfo.log.error,
      value: log.errorName ? `${log.errorName}${full?.errorCode ? ` (${full.errorCode})` : ""}` : null,
    },
    { label: t.inspector.fields.fingerprint, info: t.fieldInfo.log.fingerprint, value: log.fingerprint, mono: true, copy: true },
    { label: t.inspector.fields.id, info: t.fieldInfo.log.id, value: log.id !== undefined ? String(log.id) : null, mono: true, copy: true },
  ];

  const messageSection = (
    <section>
      <h3 className="eyebrow mb-2">{t.inspector.message}</h3>
      <div className={`max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-mono text-[0.8125rem] leading-relaxed text-ink`}>
        {log.message}
      </div>
    </section>
  );

  const actionsBar = (
    <div className="flex flex-wrap gap-2">
      {log.traceId && !readOnly && (
        <ButtonLink href={`/trace/${encodeURIComponent(log.traceId)}`} size="sm" icon="route">
          {t.inspector.viewTrace}
        </ButtonLink>
      )}
      {log.fingerprint && !readOnly && (
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
  );

  const propertiesSection = (
    <section>
      <h3 className="eyebrow mb-2">{t.inspector.properties}</h3>
      <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {properties
          .filter((property) => property.value)
          .map((property) => (
            <React.Fragment key={property.label}>
              <dt className="flex items-center gap-1.5 text-xs leading-6 text-ink-3">
                {property.label}
                <InfoTip label={property.label}>{property.info}</InfoTip>
              </dt>
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
  );

  const stackSection = full?.errorStack && (
      <section>
        <h3 className="eyebrow mb-2">{t.inspector.stack}</h3>
        <CodeBlock code={full.errorStack} language="stack" maxHeight="60vh" />
      </section>
    );

  const metadataSection = full?.metadata && Object.keys(full.metadata).length > 0 && (
      <section>
        <h3 className="eyebrow mb-2">{t.inspector.metadata}</h3>
        <CodeBlock code={JSON.stringify(full.metadata, null, 2)} language="json" maxHeight="60vh" />
      </section>
    );

  const contextSection = full && !readOnly && (
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
    );

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
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          {(onPrev || onNext) && (
            <>
              {position && (
                <span className="mr-1 hidden font-mono text-xs tabular-nums text-ink-3 sm:inline">
                  {t.inspector.position(fmt.number(position.index), fmt.number(position.total))}
                </span>
              )}
              <IconButton icon="chevronLeft" label={t.inspector.prev} disabled={!onPrev} onClick={onPrev} variant="secondary" size="sm" />
              <IconButton icon="chevronRight" label={t.inspector.next} disabled={!onNext} onClick={onNext} variant="secondary" size="sm" />
              <span aria-hidden className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <IconButton icon="x" label={t.inspector.close} onClick={onClose} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)] lg:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-5 px-6 py-5 lg:overflow-y-auto">
          {!full && <Alert variant="info">{t.inspector.liveRow}</Alert>}
          {messageSection}
          {actionsBar}
          {stackSection}
          {metadataSection}
        </div>
        <div className="flex min-w-0 flex-col gap-5 border-t border-line bg-surface-2/40 px-6 py-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
          {propertiesSection}
          {contextSection}
        </div>
      </div>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={t.inspector.title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-auto h-[90vh] max-h-none w-[90vw] max-w-none flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(4_10_14/0.55)] backdrop:backdrop-blur-[2px] open:flex open:animate-pop-in"
    >
      {content}
      {(onPrev || onNext) && (
        <footer className="hidden border-t border-line px-6 py-2 text-[0.6875rem] text-ink-3 lg:block">{t.inspector.navHint}</footer>
      )}
    </dialog>
  );
};
