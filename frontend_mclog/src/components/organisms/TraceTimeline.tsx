"use client";
// Organism: TraceTimeline (metricas y lectura de una traza, en vivo o en un snapshot)
import React, { useMemo, useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { Input } from "@/components/atoms/Input";
import { LEVEL_FILL, LevelBadge, isLevel } from "@/components/atoms/LevelBadge";
import { Segmented } from "@/components/atoms/Segmented";
import { EnvTag, Tag, TagTone } from "@/components/atoms/Tag";
import { CodeBlock } from "@/components/molecules/CodeBlock";
import { InfoTip } from "@/components/molecules/InfoTip";
import { Select } from "@/components/molecules/Select";
import { StatTile } from "@/components/molecules/StatTile";
import { useI18n } from "@/common/i18n/I18nProvider";
import {
  buildTraceModel,
  collapseRepeats,
  laneKey,
  matchesTraceFilter,
  NO_FILTER,
  TraceFilter,
  TraceModel,
  traceOffsets,
  TraceStatus,
} from "@/common/trace/model";
import type { LogEntry } from "@/hooks/useAuth";

export { traceOffsets };

const STATUS_TONE: Record<TraceStatus, TagTone> = { ok: "success", warn: "warning", failed: "danger" };
const STATUS_ICON = { ok: "checkCircle", warn: "alertCircle", failed: "xCircle" } as const;

/** Sangria por nivel de anidacion de los tramos (hasta 6). */
const DEPTH_INDENT = ["", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20", "pl-24"];

/** Porcentaje del eje (0 a la duracion total) para posicionar marcas y barras. */
const scaleOf = (duration: number) => (value: number) => (duration > 0 ? (value / duration) * 100 : 0);

/** Detalle de un paso desplegado en el sitio: lo usan los snapshots, que no abren el inspector. */
const StepDetail: React.FC<{ log: LogEntry }> = ({ log }) => {
  const { t, fmt } = useI18n();
  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-line bg-surface-2/60 px-5 py-4">
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 3xl:grid-cols-4">
        <div className="flex gap-2">
          <dt className="flex items-center gap-1 text-ink-3">
            {t.logs.columns.time}
            <InfoTip label={t.logs.columns.time}>{t.fieldInfo.log.time}</InfoTip>
          </dt>
          <dd className="font-mono text-ink">{fmt.dateTime(log.timestamp)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex items-center gap-1 text-ink-3">
            {t.inspector.fields.host}
            <InfoTip label={t.inspector.fields.host}>{t.fieldInfo.log.host}</InfoTip>
          </dt>
          <dd className="font-mono text-ink">{log.host ?? "—"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="flex items-center gap-1 text-ink-3">
            {t.inspector.fields.environment}
            <InfoTip label={t.inspector.fields.environment}>{t.fieldInfo.log.environment}</InfoTip>
          </dt>
          <dd>
            <EnvTag environment={log.environment} label={t.envs.names[log.environment] ?? log.environment} />
          </dd>
        </div>
        {log.spanId && (
          <div className="flex gap-2">
            <dt className="flex items-center gap-1 text-ink-3">
              {t.inspector.fields.spanId}
              <InfoTip label={t.inspector.fields.spanId}>{t.fieldInfo.log.spanId}</InfoTip>
            </dt>
            <dd className="truncate font-mono text-ink">{log.spanId}</dd>
          </div>
        )}
        {log.errorName && (
          <div className="flex gap-2">
            <dt className="flex items-center gap-1 text-ink-3">
              {t.inspector.fields.error}
              <InfoTip label={t.inspector.fields.error}>{t.fieldInfo.log.error}</InfoTip>
            </dt>
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
  );
};

type StepProps = {
  log: LogEntry;
  index: number;
  model: TraceModel;
  active: boolean;
  /** Logs iguales seguidos que representa esta fila (1 = ninguno plegado). */
  repeats: number;
  expanded: boolean;
  onToggleRepeats: () => void;
  onSelect?: (log: LogEntry) => void;
};

/**
 * Un paso de la vista cronologica. La pista va de 0 a la duracion total: el
 * tramo claro es el tiempo desde el paso anterior ("aqui se fue el tiempo") y,
 * si el emisor mide la duracion, la barra oscura es lo que duro el paso.
 */
const Step: React.FC<StepProps> = ({ log, index, model, active, repeats, expanded, onToggleRepeats, onSelect }) => {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const offset = model.offsets[index];
  const previous = index > 0 ? model.offsets[index - 1] : 0;
  const gap = offset - previous;
  const scale = scaleOf(model.durationMs);
  const level = isLevel(log.level) ? log.level : "debug";
  const depth = Math.min(model.depth[index] ?? 0, 6);
  const isFirstError = model.firstErrorIndex === index;
  const isLargestGap = model.largestGap?.index === index;
  const duration = log.durationMs ?? null;

  return (
    <li
      id={`trace-step-${log.id}`}
      aria-current={active || undefined}
      className={`border-b border-line last:border-b-0 ${active ? "bg-brand-soft/60" : isFirstError ? "bg-danger-soft/40" : ""}`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => (onSelect ? onSelect(log) : setOpen((value) => !value))}
          aria-expanded={onSelect ? undefined : open}
          className="grid min-w-0 flex-1 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-3 text-left transition-colors hover:bg-surface-2 lg:grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(12rem,1fr)]"
        >
          <span className="font-mono text-xs tabular-nums text-ink-2">
            +{fmt.duration(offset)}
            {gap > 0 && <span className="block text-[0.6875rem] text-ink-3">Δ {fmt.duration(gap)}</span>}
          </span>
          <span className={`min-w-0 ${DEPTH_INDENT[depth]}`}>
            <span className="flex flex-wrap items-center gap-2">
              <LevelBadge level={log.level} />
              <span className="font-mono text-[0.8125rem] font-medium text-ink">{log.application}</span>
              {log.service && log.service !== log.application && (
                <span className="font-mono text-xs text-ink-3">› {log.service}</span>
              )}
              {isFirstError && <Tag tone="danger">{t.trace.firstError}</Tag>}
              {isLargestGap && <Tag tone="warning">{t.trace.largestGap}</Tag>}
              {duration !== null && <Tag mono>{fmt.duration(duration)}</Tag>}
              {!onSelect && <Icon name={open ? "chevronUp" : "chevronDown"} className="ml-auto h-4 w-4 text-ink-3 lg:hidden" />}
            </span>
            <span className="mt-1 block truncate text-sm text-ink-2">{log.message}</span>
          </span>
          <span className="relative col-span-2 hidden h-6 items-center lg:col-span-1 lg:flex" aria-hidden>
            <span className="absolute inset-x-0 h-1.5 rounded-full bg-surface-3" />
            {gap > 0 && (
              <span
                className="absolute h-1.5 rounded-full bg-brand/30"
                style={{ left: `${scale(previous)}%`, width: `${Math.max(0.5, scale(gap))}%` }}
              />
            )}
            {duration !== null && duration > 0 && (
              <span
                className="absolute h-2.5 rounded-full bg-ink-3/60"
                style={{ left: `${scale(Math.max(0, offset - duration))}%`, width: `${Math.max(0.5, scale(Math.min(duration, offset)))}%` }}
              />
            )}
            <span
              className={`absolute h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-surface ${LEVEL_FILL[level]}`}
              style={{ left: `${scale(offset)}%` }}
            />
          </span>
        </button>
        {repeats > 1 && (
          <button
            type="button"
            onClick={onToggleRepeats}
            aria-expanded={expanded}
            className="shrink-0 border-l border-line px-3 font-mono text-xs text-ink-2 transition-colors hover:bg-surface-2"
            title={expanded ? t.trace.collapseRepeats : t.trace.expandRepeats}
          >
            {expanded ? t.trace.collapseRepeats : t.trace.repeats(fmt.number(repeats))}
          </button>
        )}
      </div>
      {open && !onSelect && <StepDetail log={log} />}
    </li>
  );
};

/** Cabecera de lectura: estado, ruta entre servicios y los datos que delatan donde fallo o se fue el tiempo. */
const TraceSummary: React.FC<{ model: TraceModel; logs: LogEntry[] }> = ({ model, logs }) => {
  const { t, fmt } = useI18n();
  const lanes = new Map(model.lanes.map((lane) => [lane.key, lane]));
  const firstError = model.firstErrorIndex !== null ? logs[model.firstErrorIndex] : null;
  // Una ruta muy larga (un bucle entre dos servicios) se corta: el detalle esta en la lista.
  const route = model.route.slice(0, 12);
  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        <Tag tone={STATUS_TONE[model.status]} icon={STATUS_ICON[model.status]}>
          {t.trace.status[model.status]}
        </Tag>
        <span>
          {t.trace.duration}: <span className="font-mono text-ink">{fmt.duration(model.durationMs)}</span>
        </span>
        <span>
          {t.trace.services}: <span className="font-mono text-ink">{fmt.number(model.lanes.length)}</span>
        </span>
        <span>
          {t.trace.hosts}: <span className="font-mono text-ink">{fmt.number(model.hosts.length)}</span>
        </span>
        {firstError && model.firstErrorIndex !== null && (
          <span>
            {t.trace.timeToFirstError}:{" "}
            <span className="font-mono text-ink">{fmt.duration(model.offsets[model.firstErrorIndex])}</span>
          </span>
        )}
        {model.largestGap && (
          <span>
            {t.trace.largestGap}: <span className="font-mono text-ink">{fmt.duration(model.largestGap.ms)}</span>
          </span>
        )}
      </div>
      <ol aria-label={t.trace.route} className="flex flex-wrap items-center gap-1.5">
        {route.map((key, position) => {
          const lane = lanes.get(key);
          return (
            <li key={`${key}-${position}`} className="flex items-center gap-1.5">
              {position > 0 && <Icon name="arrowRight" className="h-3.5 w-3.5 text-ink-3" />}
              <Tag tone={lane && lane.errors > 0 ? "danger" : lane && lane.warnings > 0 ? "warning" : "neutral"} mono>
                {key}
              </Tag>
            </li>
          );
        })}
        {model.route.length > route.length && <li className="text-xs text-ink-3">+{fmt.number(model.route.length - route.length)}</li>}
      </ol>
    </div>
  );
};

/** Vista por servicio: un carril por servicio sobre el eje comun, con una marca por paso. */
const LaneView: React.FC<{
  logs: LogEntry[];
  model: TraceModel;
  visible: Set<number>;
  activeId?: number;
  onSelect?: (log: LogEntry) => void;
}> = ({ logs, model, visible, activeId, onSelect }) => {
  const { t, fmt } = useI18n();
  const scale = scaleOf(model.durationMs);
  return (
    <ul className="flex flex-col">
      {model.lanes.map((lane) => {
        const steps = logs.map((log, index) => ({ log, index })).filter(({ log, index }) => laneKey(log) === lane.key && visible.has(index));
        return (
          <li key={lane.key} className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0 lg:grid-cols-[minmax(12rem,0.6fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <p className="truncate font-mono text-[0.8125rem] font-medium text-ink">{lane.key}</p>
              <p className="text-xs text-ink-3">
                {t.trace.laneSummary(fmt.number(lane.count), fmt.duration(lane.end - lane.start))}
                {lane.errors > 0 && <span className="text-danger"> · {t.trace.laneErrors(fmt.number(lane.errors))}</span>}
              </p>
            </div>
            <div className="relative h-7">
              <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
              <span
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand/30"
                style={{ left: `${scale(lane.start)}%`, width: `${Math.max(0.5, scale(lane.end - lane.start))}%` }}
              />
              {steps.map(({ log, index }) => {
                const level = isLevel(log.level) ? log.level : "debug";
                const offset = model.offsets[index];
                const label = `${fmt.timeSeconds(log.timestamp)} · ${t.levels.names[level]} · ${log.message.slice(0, 120)}`;
                const mark = (
                  <span
                    className={`block h-3 w-3 rounded-full ring-2 ring-surface ${LEVEL_FILL[level]} ${log.id === activeId ? "outline outline-2 outline-brand" : ""}`}
                  />
                );
                return (
                  <React.Fragment key={log.id}>
                    {log.durationMs ? (
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-ink-3/60"
                        style={{ left: `${scale(Math.max(0, offset - log.durationMs))}%`, width: `${Math.max(0.5, scale(Math.min(log.durationMs, offset)))}%` }}
                      />
                    ) : null}
                    {onSelect ? (
                      <button
                        type="button"
                        title={label}
                        aria-label={label}
                        onClick={() => onSelect(log)}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ left: `${scale(offset)}%` }}
                      >
                        {mark}
                      </button>
                    ) : (
                      <span title={label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${scale(offset)}%` }}>
                        {mark}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** Totales de la operacion. Un snapshot los trae guardados, porque puede no haber guardado todos los logs. */
export type TraceStats = { records: number; applications: string[]; durationMs: number; errors: number };

export const traceStatsOf = (logs: LogEntry[]): TraceStats => {
  const offsets = traceOffsets(logs);
  return {
    records: logs.length,
    applications: [...new Set(logs.map((log) => log.application))],
    durationMs: offsets.length > 0 ? offsets[offsets.length - 1] : 0,
    errors: logs.filter((log) => log.level === "error").length,
  };
};

export const TraceKpis: React.FC<{ stats: TraceStats; loading?: boolean }> = ({ stats, loading }) => {
  const { t, fmt } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 3xl:gap-4">
      <StatTile label={t.trace.records} info={t.fieldInfo.metrics.traceRecords} value={fmt.number(stats.records)} icon="logs" accent="brand" loading={loading} />
      <StatTile
        label={t.trace.apps}
        info={t.fieldInfo.metrics.traceApps}
        value={fmt.number(stats.applications.length)}
        hint={stats.applications.slice(0, 3).join(", ")}
        icon="box"
        loading={loading}
      />
      <StatTile label={t.trace.duration} info={t.fieldInfo.metrics.traceDuration} value={fmt.duration(stats.durationMs)} icon="clock" loading={loading} />
      <StatTile
        label={t.trace.errors}
        info={t.fieldInfo.metrics.traceErrors}
        value={fmt.number(stats.errors)}
        icon="errors"
        accent={stats.errors > 0 ? "error" : "neutral"}
        loading={loading}
      />
    </div>
  );
};

type TraceTimelineProps = {
  logs: LogEntry[];
  /** Resalta el log desde el que se abrio la traza. */
  activeId?: number;
  /** Con el, pulsar un paso lo abre en el detalle; sin el (snapshots), se despliega en el sitio. */
  onSelect?: (log: LogEntry) => void;
  /** Si la traza llega recortada: cuantos logs faltan y antes de que posicion. */
  omitted?: { beforeIndex: number; count: number };
};

/**
 * Lectura de la operacion: cabecera con estado, ruta y tiempos; vista
 * cronologica (con anidacion por tramos y repeticiones plegadas) o por
 * servicio; y un filtro por nivel, servicio y texto.
 */
export const TraceTimeline: React.FC<TraceTimelineProps> = ({ logs, activeId, onSelect, omitted }) => {
  const { t, fmt } = useI18n();
  const model = useMemo(() => buildTraceModel(logs), [logs]);
  const [view, setView] = useState<"chronological" | "lanes">("chronological");
  const [filter, setFilter] = useState<TraceFilter>(NO_FILTER);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const visibleIndexes = useMemo(
    () => logs.map((log, index) => (matchesTraceFilter(log, filter) ? index : -1)).filter((index) => index >= 0),
    [logs, filter],
  );
  const visible = useMemo(() => new Set(visibleIndexes), [visibleIndexes]);
  const groups = useMemo(() => {
    const subset = visibleIndexes.map((index) => logs[index]);
    const firstErrorPosition = model.firstErrorIndex !== null ? visibleIndexes.indexOf(model.firstErrorIndex) : -1;
    return collapseRepeats(subset, firstErrorPosition >= 0 ? firstErrorPosition : null).map((group) => ({
      index: visibleIndexes[group.index],
      count: group.count,
      members: visibleIndexes.slice(group.index, group.index + group.count),
    }));
  }, [logs, visibleIndexes, model.firstErrorIndex]);

  const filtered = filter !== NO_FILTER && (filter.level !== "" || filter.lane !== "" || filter.text.trim() !== "");

  const jumpToFirstError = () => {
    if (model.firstErrorIndex === null) return;
    setView("chronological");
    setFilter(NO_FILTER);
    const id = logs[model.firstErrorIndex].id;
    // Tras pintar la lista sin filtro, el paso ya existe en el DOM.
    requestAnimationFrame(() => {
      const element = document.getElementById(`trace-step-${id}`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.querySelector("button")?.focus({ preventScroll: true });
    });
  };

  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const rows = groups.flatMap((group) =>
    expanded.has(group.index)
      ? group.members.map((member, position) => ({ index: member, repeats: position === 0 ? group.count : 1, head: group.index }))
      : [{ index: group.index, repeats: group.count, head: group.index }],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-1.5">
          <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{t.trace.timeline}</h2>
          <InfoTip label={t.trace.explainTitle}>{t.trace.explain}</InfoTip>
        </div>
        <Segmented
          label={t.trace.view}
          semantics="tabs"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "chronological", label: t.trace.chronological },
            { value: "lanes", label: t.trace.byService },
          ]}
        />
      </header>

      <TraceSummary model={model} logs={logs} />

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <Segmented
          label={t.levels.label}
          size="sm"
          value={filter.level}
          onChange={(level) => setFilter((current) => ({ ...current, level }))}
          options={[
            { value: "", label: t.trace.levelAll },
            { value: "warn", label: t.trace.levelWarn },
            { value: "error", label: t.trace.levelError },
          ]}
        />
        {model.lanes.length > 1 && (
          <div className="w-full sm:w-56">
            <Select
              label={t.trace.services}
              icon="layers"
              size="sm"
              value={filter.lane}
              onChange={(lane) => setFilter((current) => ({ ...current, lane }))}
              options={[{ value: "", label: t.trace.allServices }, ...model.lanes.map((lane) => ({ value: lane.key, label: lane.key }))]}
            />
          </div>
        )}
        <div className="w-full sm:w-64">
          <Input
            size="sm"
            icon="search"
            value={filter.text}
            onChange={(event) => setFilter((current) => ({ ...current, text: event.target.value }))}
            placeholder={t.trace.filterText}
            aria-label={t.trace.filterText}
          />
        </div>
        {model.firstErrorIndex !== null && (
          <Button size="sm" variant="secondary" icon="xCircle" onClick={jumpToFirstError} className="sm:ml-auto">
            {t.trace.jumpToFirstError}
          </Button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {filtered ? t.trace.matches(fmt.number(visibleIndexes.length), fmt.number(logs.length)) : ""}
      </p>

      {visibleIndexes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">{t.trace.noMatches}</p>
      ) : view === "lanes" ? (
        <LaneView logs={logs} model={model} visible={visible} activeId={activeId} onSelect={onSelect} />
      ) : (
        <ol>
          {rows.map((row) => (
            <React.Fragment key={logs[row.index].id}>
              {omitted && row.index === omitted.beforeIndex && (
                <li className="border-b border-dashed border-line bg-surface-2 px-5 py-2 text-center text-xs text-ink-3">
                  {t.trace.omittedRow(fmt.number(omitted.count))}
                </li>
              )}
              <Step
                log={logs[row.index]}
                index={row.index}
                model={model}
                active={logs[row.index].id === activeId}
                repeats={row.repeats}
                expanded={expanded.has(row.head)}
                onToggleRepeats={() => toggle(row.head)}
                onSelect={onSelect}
              />
            </React.Fragment>
          ))}
        </ol>
      )}
    </section>
  );
};
