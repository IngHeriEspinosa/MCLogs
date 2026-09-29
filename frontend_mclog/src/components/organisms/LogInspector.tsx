"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink, IconButton } from "@/components/atoms/Button";
import { LevelBadge, LevelDot } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EnvTag } from "@/components/atoms/Tag";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import { InfoTip } from "@/components/molecules/InfoTip";
import { LogRow, rowKey } from "@/components/organisms/LogTable";
import { TraceKpis, TraceTimeline, traceStatsOf } from "@/components/organisms/TraceTimeline";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildLogBrief } from "@/common/reports/build";
import type { LogEntry } from "@/hooks/useAuth";
import { useFailureOccurrences, useFailureSamples, useLogContext, useTrace, useTraceCount } from "@/hooks/useErrors";

type LogInspectorProps = {
  log: LogRow;
  onClose: () => void;
  onSelect: (log: LogEntry) => void;
  /** Desde "Fallos iguales": cerrar el detalle y filtrar la tabla por la huella. */
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

/** Lo que muestra la columna izquierda bajo el mensaje: el detalle del log, su traza o sus fallos iguales. */
type Panel = "detail" | "trace" | "similar";

/** Ocurrencias que lista "Fallos iguales"; para ver todas se filtra la tabla. */
const SIMILAR_LIMIT = 50;

type PanelFrameProps = { title: string; actions?: React.ReactNode; onBack: () => void; children: React.ReactNode };

/** Marco de las vistas que sustituyen al detalle: titulo, acciones y la vuelta al detalle. */
const PanelFrame: React.FC<PanelFrameProps> = ({ title, actions, onBack, children }) => {
  const { t } = useI18n();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="eyebrow">
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          {actions}
          <Button size="xs" variant="ghost" icon="arrowLeft" onClick={onBack}>
            {t.inspector.backToDetail}
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
};

type TracePanelProps = { traceId: string; activeId?: number; total?: number; onBack: () => void };

/** La traza del log dentro del dialogo, con el log resaltado. */
const TracePanel: React.FC<TracePanelProps> = ({ traceId, activeId, total, onBack }) => {
  const { t, fmt } = useI18n();
  const trace = useTrace(traceId);
  const logs = trace.data?.data ?? [];
  return (
    <PanelFrame
      title={t.trace.title}
      onBack={onBack}
      actions={
        <ButtonLink
          href={`/trace/${encodeURIComponent(traceId)}`}
          target="_blank"
          rel="noopener"
          size="xs"
          variant="ghost"
          icon="externalLink"
        >
          {t.inspector.openTraceTab}
        </ButtonLink>
      }
    >
      {trace.isError ? (
        <Alert variant="error" title={t.trace.notFound}>
          {errorMessage(trace.error, t.common.unknownError)}
        </Alert>
      ) : (
        <TraceKpis stats={traceStatsOf(logs)} loading={trace.isLoading} />
      )}
      {trace.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}
      {total !== undefined && logs.length > 0 && total > logs.length && (
        <p className="text-xs text-ink-3">{t.inspector.traceTruncated(fmt.number(logs.length), fmt.number(total))}</p>
      )}
      {logs.length > 0 && <TraceTimeline logs={logs} activeId={activeId} />}
    </PanelFrame>
  );
};

type SimilarPanelProps = {
  fingerprint: string;
  currentId?: number;
  onSelect: (log: LogEntry) => void;
  onFilter: () => void;
  onBack: () => void;
};

/** Las ocurrencias mas recientes del mismo fallo; al pulsar una se abre su detalle. */
const SimilarPanel: React.FC<SimilarPanelProps> = ({ fingerprint, currentId, onSelect, onFilter, onBack }) => {
  const { t, fmt } = useI18n();
  const samples = useFailureSamples(fingerprint, SIMILAR_LIMIT);
  const rows = samples.data?.data ?? [];
  const total = samples.data?.total ?? 0;
  return (
    <PanelFrame
      title={t.inspector.similar}
      onBack={onBack}
      actions={
        <Button size="xs" variant="ghost" icon="filter" title={t.inspector.filterTableHint} onClick={onFilter}>
          {t.inspector.filterTable}
        </Button>
      }
    >
      {samples.isLoading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      ) : samples.isError ? (
        <p className="text-sm text-ink-3">{t.inspector.occurrencesError}</p>
      ) : total <= 1 ? (
        <p className="text-sm text-ink-3">{t.inspector.similarOnlyThis}</p>
      ) : (
        <>
          <p className="text-xs text-ink-3">
            {total > rows.length
              ? t.inspector.similarLatest(fmt.number(rows.length), fmt.number(total))
              : t.inspector.similarAll(total, fmt.number(total))}
          </p>
          <ol className="-mx-2 flex flex-col">
            {rows.map((entry) => {
              const current = entry.id === currentId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={current}
                    aria-current={current || undefined}
                    onClick={() => onSelect(entry)}
                    className={`flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      current ? "bg-brand-soft/70" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-ink-3">{fmt.dateTime(entry.timestamp)}</span>
                    <LevelDot level={entry.level} />
                    {/* En pantallas estrechas el mensaje baja a su propia linea para no quedar recortado. */}
                    <span
                      className={`order-2 min-w-0 basis-full truncate sm:order-1 sm:flex-1 sm:basis-0 ${current ? "font-medium text-ink" : "text-ink-2"}`}
                    >
                      {entry.message}
                    </span>
                    <span className="order-1 ml-auto shrink-0 sm:order-2">
                      <EnvTag environment={entry.environment} label={t.envs.names[entry.environment] ?? entry.environment} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </PanelFrame>
  );
};

/**
 * Detalle de un log en un dialogo modal al 90 % de la pantalla, con el detalle
 * a dos columnas: mensajes, stacks y metadata largos se leen sin recortes, y
 * las flechas recorren la pagina sin cerrarlo. La traza y los fallos iguales se
 * abren en la columna izquierda, sin salir del dialogo.
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
  const occurrences = useFailureOccurrences(readOnly || !full?.fingerprint ? null : full.id);
  const traceCount = useTraceCount(readOnly ? null : log.traceId ?? null);

  // El panel va ligado al log: al pasar a otro (flechas, contexto, un fallo igual) vuelve al detalle.
  const key = rowKey(log);
  const [panelState, setPanelState] = useState<{ key: string; panel: Panel }>({ key, panel: "detail" });
  const panel = panelState.key === key ? panelState.panel : "detail";
  const toggles = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const togglePanel = (next: Panel) => setPanelState({ key, panel: panel === next ? "detail" : next });
  const backToDetail = () => {
    // El boton "Volver" desaparece: el foco vuelve al que abrio el panel.
    toggles.current[panel]?.focus();
    setPanelState({ key, panel: "detail" });
  };

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
        <Button
          ref={(node) => {
            toggles.current.trace = node;
          }}
          size="sm"
          icon="route"
          variant={panel === "trace" ? "primary" : "secondary"}
          aria-pressed={panel === "trace"}
          onClick={() => togglePanel("trace")}
        >
          {traceCount.data === undefined
            ? t.inspector.viewTrace
            : t.inspector.viewTraceCount(traceCount.data, fmt.number(traceCount.data))}
        </Button>
      )}
      {log.fingerprint && !readOnly && (
        <Button
          ref={(node) => {
            toggles.current.similar = node;
          }}
          size="sm"
          icon="hash"
          variant={panel === "similar" ? "primary" : "secondary"}
          aria-pressed={panel === "similar"}
          onClick={() => togglePanel("similar")}
        >
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
          text={() =>
            buildLogBrief(full, { context: context.data?.data ?? null, occurrences: occurrences.data ?? null }, locale)
          }
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

  const frequency = occurrences.data?.data;
  const retention = fmt.number(occurrences.data?.retentionMonths ?? 0);
  const occurrenceColumns = [
    { key: "last24h", label: t.inspector.occurrences24h },
    { key: "last7d", label: t.inspector.occurrences7d },
    { key: "total", label: t.inspector.occurrencesTotal },
  ] as const;

  const occurrencesSection = full?.fingerprint && !readOnly && (
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="eyebrow">{t.inspector.occurrences}</h3>
          <span className="text-[0.6875rem] text-ink-3">{t.inspector.occurrencesHint}</span>
        </div>
        {occurrences.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : occurrences.isError || !frequency ? (
          <p className="text-sm text-ink-3">{t.inspector.occurrencesError}</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2">
              {occurrenceColumns.map((column) => (
                <div key={column.key} className="rounded-xl border border-line bg-surface px-3 py-2">
                  <dt className="text-[0.6875rem] text-ink-3">{column.label}</dt>
                  <dd className="font-mono text-base tabular-nums text-ink">{fmt.number(frequency[column.key])}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              {t.inspector.occurrencesSeen(fmt.relative(frequency.firstSeen), fmt.relative(frequency.lastSeen))}
              <InfoTip label={t.inspector.occurrences}>{t.inspector.occurrencesRetention(retention)}</InfoTip>
            </p>
            {frequency.environments.length > 1 && (
              <table className="mt-3 w-full text-xs">
                <caption className="sr-only">{t.inspector.occurrencesByEnv}</caption>
                <thead>
                  <tr className="text-left text-ink-3">
                    <th scope="col" className="pb-1 font-normal">{t.inspector.fields.environment}</th>
                    {occurrenceColumns.map((column) => (
                      <th key={column.key} scope="col" className="pb-1 text-right font-normal">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frequency.environments.map((row) => (
                    <tr key={row.environment} className="border-t border-line">
                      <th scope="row" className="py-1 text-left font-normal">
                        <EnvTag environment={row.environment} label={t.envs.names[row.environment] ?? row.environment} />
                      </th>
                      {occurrenceColumns.map((column) => (
                        <td key={column.key} className="py-1 text-right font-mono tabular-nums text-ink-2">
                          {fmt.number(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    );

  // Laplace nunca da 1, pero un 99,97 % redondeado se leeria como certeza.
  const probabilityPercent = (value: number) =>
    value >= 0.9995 ? t.inspector.probabilityAbove(fmt.percent(0.999)) : fmt.percent(value);
  const failureRate = frequency?.failureRate;
  const operationScope = failureRate
    ? [
        failureRate.service && failureRate.service !== failureRate.application
          ? `${failureRate.application} › ${failureRate.service}`
          : failureRate.application,
        t.envs.names[failureRate.environment] ?? failureRate.environment,
      ].join(" · ")
    : "";
  const probabilities = frequency
    ? [
        { key: "nextHour", label: t.inspector.probabilityNextHour, value: probabilityPercent(frequency.recurrence.nextHour) },
        { key: "next24h", label: t.inspector.probabilityNext24h, value: probabilityPercent(frequency.recurrence.next24h) },
        ...(failureRate && failureRate.rate !== null
          ? [{ key: "perOperation", label: t.inspector.probabilityPerOperation, value: fmt.percent(failureRate.rate) }]
          : []),
      ]
    : [];
  // Menos de un dia observado, o una tasa sobre muy pocas operaciones.
  const lowData =
    !!frequency &&
    (frequency.recurrence.observedHours < 24 || (frequency.failureRate.rate !== null && frequency.failureRate.operations < 30));

  const probabilitySection = full?.fingerprint && !readOnly && (occurrences.isLoading || frequency) && (
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h3 className="eyebrow">{t.inspector.probability}</h3>
            <InfoTip label={t.inspector.probability}>{t.inspector.probabilityInfo}</InfoTip>
          </div>
          <span className="text-[0.6875rem] text-ink-3">{t.inspector.probabilityHint}</span>
        </div>
        {!frequency ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <dl className={`grid gap-2 ${probabilities.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {probabilities.map((item) => (
                <div key={item.key} className="rounded-xl border border-line bg-surface px-3 py-2">
                  <dt className="text-[0.6875rem] text-ink-3">{item.label}</dt>
                  <dd className="font-mono text-base tabular-nums text-ink">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex flex-col gap-0.5 text-xs text-ink-3">
              <p>
                {t.inspector.probabilityHours(
                  fmt.number(frequency.recurrence.activeHours),
                  fmt.number(frequency.recurrence.observedHours),
                )}
              </p>
              {failureRate && failureRate.rate !== null && (
                <p>
                  {t.inspector.probabilityOperations(
                    fmt.number(failureRate.failed),
                    failureRate.operations,
                    fmt.number(failureRate.operations),
                    operationScope,
                  )}
                </p>
              )}
              {lowData && <p className="text-ink-2">{t.inspector.probabilityLowData}</p>}
            </div>
          </>
        )}
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
          {panel === "trace" && log.traceId ? (
            <TracePanel traceId={log.traceId} activeId={full?.id} total={traceCount.data} onBack={backToDetail} />
          ) : panel === "similar" && log.fingerprint ? (
            <SimilarPanel
              fingerprint={log.fingerprint}
              currentId={full?.id}
              onSelect={onSelect}
              onFilter={() => onFilterFingerprint(log.fingerprint as string)}
              onBack={backToDetail}
            />
          ) : (
            <>
              {stackSection}
              {metadataSection}
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5 border-t border-line bg-surface-2/40 px-6 py-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
          {propertiesSection}
          {occurrencesSection}
          {probabilitySection}
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
