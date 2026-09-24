"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Icon, Logo } from "@/components/atoms/Icon";
import { Spinner } from "@/components/atoms/Spinner";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { InfoTip } from "@/components/molecules/InfoTip";
import { ErrorGroupsTable, ErrorKpis } from "@/components/organisms/ErrorGroups";
import { LogInspector } from "@/components/organisms/LogInspector";
import { Density, LogTable, rowKey } from "@/components/organisms/LogTable";
import { SnapshotOverview } from "@/components/organisms/SnapshotOverview";
import { LanguageMenu, ThemeMenu } from "@/components/organisms/Topbar";
import { TraceKpis, TraceTimeline } from "@/components/organisms/TraceTimeline";
import { useI18n } from "@/common/i18n/I18nProvider";
import { paginate, sortLogs } from "@/common/snapshots/view";
import type { LogEntry } from "@/hooks/useAuth";
import type { SortField } from "@/hooks/useLogFilters";
import { usePreference } from "@/hooks/usePreference";
import { Snapshot, SnapshotFilters, usePublicSnapshot } from "@/hooks/useSnapshots";

/** Marco de la pagina: fuera del panel, porque quien la abre puede no tener cuenta. */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-[3840px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 hover:no-underline">
            <Logo className="h-9 w-9" />
            <span className="leading-none">
              <span className="block font-heading text-base font-bold text-ink">{t.app.name}</span>
              <span className="mt-1 block font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-3">{t.app.tagline}</span>
            </span>
          </Link>
          <div className="flex items-center gap-0.5">
            <LanguageMenu />
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[3840px] flex-1 flex-col px-4 py-6 sm:px-6 3xl:py-8">{children}</main>
      <footer className="px-6 py-6 text-center font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
        {t.sponsor.label}{" "}
        <a href={t.sponsor.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 hover:text-accent-500">
          {t.sponsor.name}
        </a>
      </footer>
    </div>
  );
};

const FILTER_KEYS = [
  "application",
  "level",
  "environment",
  "search",
  "fingerprint",
  "service",
  "host",
  "traceId",
  "message",
  "errorName",
  "errorCode",
] as const;

/** Los filtros con los que se capturo, como etiquetas: se lee que se esta viendo. */
const FilterChips: React.FC<{ filters: SnapshotFilters; withRange: boolean }> = ({ filters, withRange }) => {
  const { t, fmt } = useI18n();
  const labels = t.snapshots.viewer.filterLabels;
  const valueOf = (key: (typeof FILTER_KEYS)[number], value: string) => {
    if (key === "level") return t.levels.names[value as keyof typeof t.levels.names] ?? value;
    if (key === "environment") return t.envs.names[value as keyof typeof t.envs.names] ?? value;
    if (key === "fingerprint") return `${value.slice(0, 12)}…`;
    return value;
  };
  const range = filters.from
    ? `${fmt.dateTimeShort(filters.from)} – ${filters.to ? fmt.dateTimeShort(filters.to) : t.time.now}`
    : t.snapshots.viewer.allTime;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {withRange && (
        <Tag icon="calendar">
          <span className="text-ink-3">{t.snapshots.viewer.range}:</span> {range}
        </Tag>
      )}
      {FILTER_KEYS.filter((key) => filters[key]).map((key) => (
        <Tag key={key} mono={key !== "level" && key !== "environment"} title={String(filters[key])}>
          <span className="font-sans text-ink-3">{labels[key]}:</span> {valueOf(key, String(filters[key]))}
        </Tag>
      ))}
    </div>
  );
};

/** El detalle de un log guardado: solo lectura, y con ←/→ si viene de una lista. */
const useInspector = (rows: LogEntry[]) => {
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const index = selected ? rows.findIndex((row) => row.id === selected.id) : -1;
  const inspector = selected && (
    <LogInspector
      log={selected}
      readOnly
      onClose={() => setSelected(null)}
      onSelect={setSelected}
      onFilterFingerprint={() => undefined}
      onPrev={index > 0 ? () => setSelected(rows[index - 1]) : undefined}
      onNext={index >= 0 && index < rows.length - 1 ? () => setSelected(rows[index + 1]) : undefined}
      position={index >= 0 ? { index: index + 1, total: rows.length } : undefined}
    />
  );
  return { selected, setSelected, inspector };
};

/** Logs o Registros: el resumen y la tabla, ordenable y paginada en el navegador. */
const LogsBody: React.FC<{ snapshot: Extract<Snapshot, { kind: "logs" }> }> = ({ snapshot }) => {
  const { t, fmt } = useI18n();
  const [sortField, setSortField] = useState<SortField>(snapshot.filters.sortField ?? "timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(snapshot.filters.sortDir ?? "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [density, setDensity] = usePreference<Density>("density", "comfortable");

  const sorted = useMemo(() => sortLogs(snapshot.logs, sortField, sortDir), [snapshot.logs, sortField, sortDir]);
  const current = paginate(sorted, page, pageSize);
  const { selected, setSelected, inspector } = useInspector(current.rows);
  const saved = snapshot.logs.length;

  return (
    <>
      <SnapshotOverview summary={snapshot.summary} to={snapshot.filters.to ?? snapshot.createdAt} />

      {snapshot.totalMatched > saved && <Alert variant="info">{t.snapshots.viewer.rowsNote(fmt.number(saved), fmt.number(snapshot.totalMatched))}</Alert>}

      <LogTable
        rows={current.rows}
        loading={false}
        fetching={false}
        error={null}
        total={saved}
        page={current.page}
        totalPages={current.totalPages}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        selectedKey={selected ? rowKey(selected) : null}
        onSelect={(row) => setSelected(row as LogEntry)}
        density={density}
        onDensity={setDensity}
        live={false}
        sortField={sortField}
        sortDir={sortDir}
        onSort={(sort) => {
          if (sort.sortField) setSortField(sort.sortField);
          if (sort.sortDir) setSortDir(sort.sortDir);
          setPage(1);
        }}
      />
      {inspector}
    </>
  );
};

/** Errores: las mismas tarjetas y tabla que la pantalla, y el ejemplo guardado de cada fallo. */
const ErrorsBody: React.FC<{ snapshot: Extract<Snapshot, { kind: "errors" }> }> = ({ snapshot }) => {
  const { t } = useI18n();
  const samples = useMemo(() => new Map(snapshot.logs.map((log) => [log.id, log])), [snapshot.logs]);
  // El orden de los ejemplos sigue al de los grupos, para que ←/→ recorran la tabla.
  const ordered = useMemo(
    () => snapshot.summary.groups.map((group) => samples.get(group.lastLogId)).filter((log): log is LogEntry => Boolean(log)),
    [snapshot.summary.groups, samples],
  );
  const { setSelected, inspector } = useInspector(ordered);

  return (
    <>
      <ErrorKpis groups={snapshot.summary.groups} level={snapshot.summary.level} />
      <ErrorGroupsTable
        groups={snapshot.summary.groups}
        actions={(group) => {
          const sample = samples.get(group.lastLogId);
          return sample ? (
            <Button size="sm" icon="eye" title={t.snapshots.viewer.viewSampleHint} onClick={() => setSelected(sample)}>
              {t.snapshots.viewer.viewSample}
            </Button>
          ) : null;
        }}
      />
      {inspector}
    </>
  );
};

/** Traza: los totales de la operacion entera y su linea temporal. */
const TraceBody: React.FC<{ snapshot: Extract<Snapshot, { kind: "trace" }> }> = ({ snapshot }) => {
  const { t, fmt } = useI18n();
  const { summary, logs } = snapshot;
  return (
    <>
      <TraceKpis stats={{ records: summary.total, applications: summary.applications, durationMs: summary.durationMs, errors: summary.errors }} />
      {summary.total > logs.length && (
        <Alert variant="info">{t.snapshots.viewer.traceTruncated(fmt.number(logs.length), fmt.number(summary.total))}</Alert>
      )}
      <TraceTimeline logs={logs} />
    </>
  );
};

const SnapshotContent: React.FC<{ snapshot: Snapshot }> = ({ snapshot }) => {
  const { t, fmt } = useI18n();

  useEffect(() => {
    document.title = `${snapshot.title} · MCLog`;
  }, [snapshot.title]);

  return (
    <div className="flex flex-col gap-4 3xl:gap-5">
      <div className="flex flex-col gap-3">
        <p className="eyebrow flex items-center gap-2">
          <Icon name="camera" className="h-3.5 w-3.5 text-accent-500" />
          {t.snapshots.viewer.badge} · {t.snapshots.kinds[snapshot.kind]}
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{snapshot.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-3">
          <span>{t.snapshots.viewer.captured(fmt.dateTime(snapshot.createdAt))}</span>
          {snapshot.expiresAt && <span>· {t.snapshots.viewer.expires(fmt.relative(snapshot.expiresAt))}</span>}
          {snapshot.workspaceName && (
            <span className="flex items-center gap-1.5">
              · <Icon name="layers" className="h-3.5 w-3.5" /> {snapshot.workspaceName}
            </span>
          )}
          <Tag tone={snapshot.visibility === "public" ? "info" : "brand"} icon={snapshot.visibility === "public" ? "globe" : "users"}>
            {snapshot.visibility === "public" ? t.snapshots.visibilityPublic : t.snapshots.visibilityWorkspace}
          </Tag>
          {snapshot.redacted && (
            <span className="flex items-center gap-1">
              <Tag tone="warning" icon="shield">
                {t.snapshots.viewer.redacted}
              </Tag>
              <InfoTip label={t.snapshots.viewer.redacted}>{t.snapshots.viewer.redactedHint}</InfoTip>
            </span>
          )}
        </div>
        <FilterChips filters={snapshot.filters} withRange={snapshot.kind !== "trace"} />
        <p className="text-xs text-ink-3">{t.snapshots.viewer.frozen}</p>
      </div>

      {snapshot.kind === "errors" ? (
        <ErrorsBody snapshot={snapshot} />
      ) : snapshot.kind === "trace" ? (
        <TraceBody snapshot={snapshot} />
      ) : (
        <LogsBody snapshot={snapshot} />
      )}
    </div>
  );
};

export default function SnapshotPage() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const query = usePublicSnapshot(token);

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div className="flex flex-1 items-center justify-center text-ink-3">
        <Spinner className="h-6 w-6" label={t.common.loading} />
      </div>
    );
  } else if (query.isError) {
    body = <Alert variant="error">{t.snapshots.viewer.loadError}</Alert>;
  } else if (query.data.state === "signIn") {
    body = (
      <Card className="m-auto w-full max-w-lg">
        <EmptyState
          icon="lock"
          title={t.snapshots.viewer.signIn}
          description={t.snapshots.viewer.signInHint}
          action={
            <ButtonLink href={`/?next=${encodeURIComponent(`/s/${token}`)}`} variant="primary" iconRight="arrowRight">
              {t.snapshots.viewer.signInAction}
            </ButtonLink>
          }
        />
      </Card>
    );
  } else if (query.data.state === "notFound") {
    body = (
      <Card className="m-auto w-full max-w-lg">
        <EmptyState
          icon="camera"
          title={t.snapshots.viewer.notFound}
          description={t.snapshots.viewer.notFoundHint}
          action={
            <ButtonLink href="/" variant="secondary">
              {t.snapshots.viewer.openConsole}
            </ButtonLink>
          }
        />
      </Card>
    );
  } else {
    body = <SnapshotContent snapshot={query.data.snapshot} />;
  }

  return <Shell>{body}</Shell>;
}
