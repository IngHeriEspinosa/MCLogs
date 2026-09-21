"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { LEVEL_FILL, LevelBadge, isLevel } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EnvTag } from "@/components/atoms/Tag";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { CopyButton } from "@/components/molecules/CopyButton";
import { StatTile } from "@/components/molecules/StatTile";
import { useToast } from "@/components/molecules/Toast";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { saveFile } from "@/common/api/download";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildTraceBrief, buildTraceMarkdown } from "@/common/reports/build";
import type { LogEntry } from "@/hooks/useAuth";
import { useTrace } from "@/hooks/useErrors";

type TraceRowProps = { log: LogEntry; offset: number; previous: number; duration: number };

/**
 * Una linea de la traza. La pista de la derecha va de 0 a la duracion total:
 * el tramo coloreado es el tiempo desde el paso anterior, que es donde se ve
 * de un vistazo "aqui se fue el tiempo".
 */
const TraceRow: React.FC<TraceRowProps> = ({ log, offset, previous, duration }) => {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const scale = (value: number) => (duration > 0 ? (value / duration) * 100 : 0);
  const gap = offset - previous;
  const level = isLevel(log.level) ? log.level : "debug";

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-3 text-left transition-colors hover:bg-surface-2 lg:grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(12rem,1fr)]"
      >
        <span className="font-mono text-xs tabular-nums text-ink-2">
          +{fmt.duration(offset)}
          {gap > 0 && <span className="block text-[0.6875rem] text-ink-3">Δ {fmt.duration(gap)}</span>}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <LevelBadge level={log.level} />
            <span className="font-mono text-[0.8125rem] font-medium text-ink">{log.application}</span>
            {log.service && log.service !== log.application && (
              <span className="font-mono text-xs text-ink-3">› {log.service}</span>
            )}
            <Icon name={open ? "chevronUp" : "chevronDown"} className="ml-auto h-4 w-4 text-ink-3 lg:hidden" />
          </span>
          <span className="mt-1 block truncate text-sm text-ink-2">{log.message}</span>
        </span>
        <span className="relative col-span-2 hidden h-6 items-center lg:col-span-1 lg:flex" aria-hidden>
          <span className="absolute inset-x-0 h-1.5 rounded-full bg-surface-3" />
          {gap > 0 && (
            <span
              className="absolute h-1.5 rounded-full bg-brand/35"
              style={{ left: `${scale(previous)}%`, width: `${Math.max(0.5, scale(gap))}%` }}
            />
          )}
          <span
            className={`absolute h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-surface ${LEVEL_FILL[level]}`}
            style={{ left: `${scale(offset)}%` }}
          />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-dashed border-line bg-surface-2/60 px-5 py-4">
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 3xl:grid-cols-4">
            <div className="flex gap-2">
              <dt className="text-ink-3">{t.logs.columns.time}</dt>
              <dd className="font-mono text-ink">{fmt.dateTime(log.timestamp)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-3">{t.inspector.fields.host}</dt>
              <dd className="font-mono text-ink">{log.host ?? "—"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-ink-3">{t.inspector.fields.environment}</dt>
              <dd>
                <EnvTag environment={log.environment} label={t.envs.names[log.environment] ?? log.environment} />
              </dd>
            </div>
            {log.errorName && (
              <div className="flex gap-2">
                <dt className="text-ink-3">{t.inspector.fields.error}</dt>
                <dd className="font-mono text-ink">
                  {log.errorName}
                  {log.errorCode ? ` (${log.errorCode})` : ""}
                </dd>
              </div>
            )}
          </dl>
          <p className="whitespace-pre-wrap break-words font-mono text-[0.8125rem] leading-relaxed text-ink">{log.message}</p>
          {log.errorStack && <CodeBlock code={log.errorStack} language="stack" maxHeight="18rem" />}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <CodeBlock code={JSON.stringify(log.metadata, null, 2)} language="json" maxHeight="18rem" />
          )}
        </div>
      )}
    </li>
  );
};

export default function TracePage() {
  const { t, fmt, locale } = useI18n();
  const notify = useToast();
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId ?? "");
  const trace = useTrace(traceId);

  const logs = trace.data?.data ?? [];
  const origin = logs.length > 0 ? new Date(logs[0].timestamp).getTime() : 0;
  const offsets = logs.map((log) => new Date(log.timestamp).getTime() - origin);
  const duration = offsets.length > 0 ? offsets[offsets.length - 1] : 0;
  const applications = [...new Set(logs.map((log) => log.application))];
  const errors = logs.filter((log) => log.level === "error").length;

  const download = () => {
    const name = `mclog-trace-${traceId.slice(0, 24).replace(/[^\w-]/g, "_")}.md`;
    saveFile(buildTraceMarkdown(traceId, logs, locale), name, "text/markdown");
    notify(t.toast.downloaded(name));
  };

  return (
    <DashboardLayout
      title={t.trace.title}
      eyebrow={t.trace.eyebrow}
      description={t.trace.description}
      actions={
        <>
          <ButtonLink href="/" icon="arrowLeft" variant="ghost">
            {t.trace.back}
          </ButtonLink>
          {logs.length > 0 && (
            <>
              <Button icon="download" onClick={download}>
                {t.trace.downloadMd}
              </Button>
              <CopyButton
                size="md"
                variant="primary"
                icon="sparkles"
                label={t.trace.copyAi}
                toast={t.toast.aiCopied}
                text={() => buildTraceBrief(traceId, logs, locale)}
              />
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-card">
          <Icon name="route" className="h-4 w-4 text-brand" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{traceId}</code>
          <CopyButton text={traceId} label={t.trace.copyId} iconOnly size="sm" variant="ghost" />
        </div>

        {trace.isError && (
          <Alert variant="error" title={t.trace.notFound}>
            {errorMessage(trace.error, t.common.unknownError)}
          </Alert>
        )}

        {!trace.isError && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 3xl:gap-4">
            <StatTile label={t.trace.records} value={fmt.number(logs.length)} icon="logs" accent="brand" loading={trace.isLoading} />
            <StatTile
              label={t.trace.apps}
              value={fmt.number(applications.length)}
              hint={applications.slice(0, 3).join(", ")}
              icon="box"
              loading={trace.isLoading}
            />
            <StatTile label={t.trace.duration} value={fmt.duration(duration)} icon="clock" loading={trace.isLoading} />
            <StatTile
              label={t.trace.errors}
              value={fmt.number(errors)}
              icon="errors"
              accent={errors > 0 ? "error" : "neutral"}
              loading={trace.isLoading}
            />
          </div>
        )}

        {trace.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        )}

        {logs.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{t.trace.timeline}</h2>
              <p className="text-xs text-ink-3">{t.trace.hint}</p>
            </header>
            <ol>
              {logs.map((log, index) => (
                <TraceRow
                  key={log.id}
                  log={log}
                  offset={offsets[index]}
                  previous={index > 0 ? offsets[index - 1] : 0}
                  duration={duration}
                />
              ))}
            </ol>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
