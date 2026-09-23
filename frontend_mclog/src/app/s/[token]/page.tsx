"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { ButtonLink } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Icon, Logo } from "@/components/atoms/Icon";
import { Spinner } from "@/components/atoms/Spinner";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { InfoTip } from "@/components/molecules/InfoTip";
import { LogInspector } from "@/components/organisms/LogInspector";
import { Density, LogTable, rowKey } from "@/components/organisms/LogTable";
import { SnapshotOverview } from "@/components/organisms/SnapshotOverview";
import { LanguageMenu, ThemeMenu } from "@/components/organisms/Topbar";
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
const FilterChips: React.FC<{ filters: SnapshotFilters }> = ({ filters }) => {
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
      <Tag icon="calendar">
        <span className="text-ink-3">{t.snapshots.viewer.range}:</span> {range}
      </Tag>
      {FILTER_KEYS.filter((key) => filters[key]).map((key) => (
        <Tag key={key} mono={key !== "level" && key !== "environment"} title={String(filters[key])}>
          <span className="font-sans text-ink-3">{labels[key]}:</span> {valueOf(key, String(filters[key]))}
        </Tag>
      ))}
    </div>
  );
};

const SnapshotContent: React.FC<{ snapshot: Snapshot }> = ({ snapshot }) => {
  const { t, fmt } = useI18n();
  const [sortField, setSortField] = useState<SortField>(snapshot.filters.sortField ?? "timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(snapshot.filters.sortDir ?? "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [density, setDensity] = usePreference<Density>("density", "comfortable");
  const [selected, setSelected] = useState<LogEntry | null>(null);

  useEffect(() => {
    document.title = `${snapshot.title} · MCLog`;
  }, [snapshot.title]);

  const sorted = useMemo(() => sortLogs(snapshot.logs, sortField, sortDir), [snapshot.logs, sortField, sortDir]);
  const current = paginate(sorted, page, pageSize);
  const selectedIndex = selected ? current.rows.findIndex((row) => row.id === selected.id) : -1;
  const saved = snapshot.logs.length;

  return (
    <div className="flex flex-col gap-4 3xl:gap-5">
      <div className="flex flex-col gap-3">
        <p className="eyebrow flex items-center gap-2">
          <Icon name="camera" className="h-3.5 w-3.5 text-accent-500" />
          {t.snapshots.viewer.badge}
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
        <FilterChips filters={snapshot.filters} />
        <p className="text-xs text-ink-3">{t.snapshots.viewer.frozen}</p>
      </div>

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

      {selected && (
        <LogInspector
          log={selected}
          readOnly
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onFilterFingerprint={() => undefined}
          onPrev={selectedIndex > 0 ? () => setSelected(current.rows[selectedIndex - 1]) : undefined}
          onNext={selectedIndex >= 0 && selectedIndex < current.rows.length - 1 ? () => setSelected(current.rows[selectedIndex + 1]) : undefined}
          position={selectedIndex >= 0 ? { index: selectedIndex + 1, total: current.rows.length } : undefined}
        />
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
