"use client";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { Menu } from "@/components/molecules/Menu";
import { Select } from "@/components/molecules/Select";
import { StatTile } from "@/components/molecules/StatTile";
import { useToast } from "@/components/molecules/Toast";
import { ErrorGroupsTable, ErrorKpis } from "@/components/organisms/ErrorGroups";
import { SavedViewsMenu } from "@/components/organisms/SavedViewsMenu";
import { ShareSnapshotDialog } from "@/components/organisms/ShareSnapshotDialog";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import client from "@/common/api/client";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildGroupBrief } from "@/common/reports/build";
import {
  DEFAULT_RANGE,
  isRelative,
  MAX_TIMELINE_HOURS,
  Preset,
  queryWindow,
  rangeFromParams,
  rangeToParams,
  sameRange,
  TimeRange,
} from "@/common/time/range";
import type { LogEntry } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { ErrorGroup, ErrorGroupStatusFilter, GROUPS_SHOWN, useErrorGroups } from "@/hooks/useErrors";
import { useUpdateErrorGroups } from "@/hooks/useMonitoring";
import { useNow } from "@/hooks/useNow";
import { useFilterOptions } from "@/hooks/useOptions";
import { useWorkspace } from "@/hooks/useWorkspaces";

const PRESETS: readonly Preset[] = ["1h", "6h", "24h", "7d", "30d"];
const STATUS_TABS = ["", "active", "regressed", "resolved", "ignored"] as const;
const SORTS = ["count", "lastSeen", "firstSeen"] as const;
const HOUR_MS = 60 * 60 * 1000;

type Filters = {
  range: TimeRange;
  level: "error" | "warn";
  environment: string;
  application: string;
  service: string;
  search: string;
  status: (typeof STATUS_TABS)[number];
  sort: (typeof SORTS)[number];
};

function ErrorsView() {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const options = useFilterOptions();
  const notify = useToast();
  const { isOwner } = useWorkspace();
  const updateGroups = useUpdateErrorGroups();

  // Filtros en la URL, igual que en la vista de logs: el enlace "Ver todos"
  // del resumen llega aqui con el mismo rango.
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const status = params.get("status");
  const sort = params.get("sort");
  const filters: Filters = {
    range: rangeFromParams(params),
    level: params.get("level") === "warn" ? "warn" : "error",
    environment: params.get("environment") ?? "",
    application: params.get("application") ?? "",
    service: params.get("service") ?? "",
    search: params.get("search") ?? "",
    status: (STATUS_TABS as readonly string[]).includes(status ?? "") ? (status as Filters["status"]) : "",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Filters["sort"]) : "count",
  };

  const update = (patch: Partial<Filters>) => {
    const values = { ...filters, ...patch };
    const next = new URLSearchParams();
    if (!sameRange(values.range, DEFAULT_RANGE)) {
      Object.entries(rangeToParams(values.range)).forEach(([key, value]) => value && next.set(key, value));
    }
    if (values.level !== "error") next.set("level", values.level);
    if (values.sort !== "count") next.set("sort", values.sort);
    (["environment", "application", "service", "search", "status"] as const).forEach((key) => values[key] && next.set(key, values[key]));
    const query = next.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    // La busqueda llega mientras se teclea: no llena el historial.
    if (Object.keys(patch).every((key) => key === "search" || key === "service")) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  // La busqueda se escribe en local y llega a la URL con retardo.
  const [search, setSearch] = useState(filters.search);
  const [service, setService] = useState(filters.service);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => setService(filters.service), [filters.service]);
  const debouncedSearch = useDebounce(search);
  const debouncedService = useDebounce(service);
  useEffect(() => {
    if (debouncedSearch !== filters.search || debouncedService !== filters.service) {
      update({ search: debouncedSearch, service: debouncedService });
    }
    // Solo reacciona a lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedService]);

  const [now] = useNow(60_000, false, JSON.stringify(filters.range));
  const isAll = isRelative(filters.range) && filters.range.preset === "all";
  const bounds = queryWindow(filters.range, now);
  const span = isAll ? { hours: MAX_TIMELINE_HOURS } : { from: bounds.from?.toISOString(), to: bounds.to?.toISOString() };

  const groups = useErrorGroups({
    ...span,
    level: filters.level,
    application: filters.application || undefined,
    environment: filters.environment || undefined,
    service: filters.service || undefined,
    search: filters.search || undefined,
    status: (filters.status || undefined) as ErrorGroupStatusFilter | undefined,
    sort: filters.sort,
    series: true,
    limit: GROUPS_SHOWN + 1,
  });

  // Se pide uno de mas: si llega, hay mas de GROUPS_SHOWN y se dice "100+".
  const found = groups.data?.data ?? [];
  const capped = found.length > GROUPS_SHOWN;
  const data = found.slice(0, GROUPS_SHOWN);
  const lifecycle = groups.data?.lifecycle;
  const [sharing, setSharing] = useState(false);
  const stale = groups.isFetching && !groups.isLoading;

  // Seleccion para las acciones en bloque: se vacia al cambiar de vista.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const viewKey = searchParams.toString();
  useEffect(() => setSelected(new Set()), [viewKey]);
  const toggle = (fingerprint: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  const toggleAll = () =>
    setSelected((current) => (data.every((group) => current.has(group.fingerprint)) ? new Set() : new Set(data.map((group) => group.fingerprint))));

  const applyStatus = async (status: "active" | "resolved" | "ignored", ignoreHours?: number) => {
    try {
      const result = await updateGroups.mutateAsync({
        fingerprints: [...selected],
        status,
        ignoredUntil: status === "ignored" && ignoreHours ? new Date(Date.now() + ignoreHours * HOUR_MS).toISOString() : null,
      });
      notify(t.errors.bulk.done(fmt.number(result.updated)));
      setSelected(new Set());
    } catch (error) {
      notify(errorMessage(error, t.common.unknownError), "error");
    }
  };

  const rangeQuery = Object.entries(rangeToParams(filters.range))
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const openReport = (kind: "markdown" | "agent-md") => {
    const query = new URLSearchParams({ kind, generate: "1" });
    Object.entries(rangeToParams(filters.range)).forEach(([key, value]) => value && query.set(key, value));
    if (filters.application) query.set("application", filters.application);
    if (filters.environment) query.set("environment", filters.environment);
    router.push(`/reports?${query.toString()}`);
  };

  const groupBrief = async (group: ErrorGroup) => {
    const sample = await client
      .get<LogEntry>(`/api/logs/${group.lastLogId}`)
      .then((response) => response.data)
      .catch(() => null);
    const groupWindow = groups.data ? { from: groups.data.from, to: groups.data.to } : null;
    return buildGroupBrief(group, sample, groupWindow, locale);
  };

  return (
    <DashboardLayout
      title={t.errors.title}
      eyebrow={t.errors.eyebrow}
      description={t.errors.description}
      presentable
      actions={
        <>
          <SavedViewsMenu path="/errors" />
          <Button variant="secondary" icon="share" title={t.snapshots.shareHint} onClick={() => setSharing(true)}>
            {t.snapshots.share}
          </Button>
          <Menu
            label={t.logs.exportReports}
            icon="report"
            variant="primary"
            items={[
              { key: "md", label: t.logs.exportMd, hint: t.logs.exportMdHint, icon: "report", onSelect: () => openReport("markdown") },
              { key: "ai", label: t.logs.exportAi, hint: t.logs.exportAiHint, icon: "sparkles", onSelect: () => openReport("agent-md") },
            ]}
          />
        </>
      }
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-auto sm:min-w-[15rem]">
            <DateRangePicker value={filters.range} onChange={(next) => update({ range: next })} presets={PRESETS} />
          </div>
          <Segmented
            label={t.levels.label}
            value={filters.level}
            onChange={(next) => update({ level: next })}
            options={[
              { value: "error", label: t.errors.levelErrors },
              { value: "warn", label: t.errors.levelWarnings },
            ]}
          />
          <div className="w-[calc(50%-0.25rem)] sm:w-52">
            <Select
              label={t.envs.label}
              icon="layers"
              value={filters.environment}
              onChange={(next) => update({ environment: next })}
              options={options.environments}
            />
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-56">
            <Select
              label={t.logs.application}
              icon="box"
              value={filters.application}
              onChange={(next) => update({ application: next })}
              options={options.apps}
              searchable
              allowCustom
            />
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-48">
            <Input
              icon="layers"
              value={service}
              onChange={(event) => setService(event.target.value)}
              placeholder={t.errors.servicePlaceholder}
              aria-label={t.inspector.fields.service}
            />
          </div>
          <div className="w-full sm:w-64">
            <Input icon="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.errors.searchPlaceholder} aria-label={t.errors.searchPlaceholder} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label={t.errors.statusLabel}
            semantics="tabs"
            value={filters.status}
            onChange={(next) => update({ status: next })}
            options={STATUS_TABS.map((value) => ({ value, label: t.errors.statusTabs[value || "all"] }))}
          />
          <div className="w-full sm:w-56">
            <Select
              label={t.errors.sortLabel}
              icon="sort"
              value={filters.sort}
              onChange={(next) => update({ sort: next })}
              options={SORTS.map((value) => ({ value, label: t.errors.sorts[value] }))}
            />
          </div>
        </div>

        <ErrorKpis groups={data} capped={capped} level={filters.level} loading={groups.isLoading} stale={stale} />

        {lifecycle && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 3xl:gap-4">
            <StatTile label={t.errors.lifecycle.new} info={t.errors.lifecycle.newInfo} value={fmt.number(lifecycle.newInWindow)} icon="plus" accent="neutral" stale={stale} />
            <StatTile
              label={t.errors.lifecycle.regressed}
              info={t.errors.lifecycle.regressedInfo}
              value={fmt.number(lifecycle.regressedInWindow)}
              icon="refresh"
              accent={lifecycle.regressedInWindow > 0 ? "error" : "neutral"}
              stale={stale}
            />
            <StatTile label={t.errors.lifecycle.resolved} info={t.errors.lifecycle.resolvedInfo} value={fmt.number(lifecycle.resolvedInWindow)} icon="checkCircle" accent="neutral" stale={stale} />
            <StatTile
              label={t.errors.lifecycle.mttr}
              info={t.errors.lifecycle.mttrInfo}
              value={lifecycle.mttrMs === null ? "—" : fmt.duration(lifecycle.mttrMs)}
              icon="clock"
              accent="neutral"
              stale={stale}
            />
          </div>
        )}

        {groups.isError && <Alert variant="error" title={t.errors.loadError}>{errorMessage(groups.error, t.common.unknownError)}</Alert>}

        {isOwner && selected.size > 0 && (
          <div role="region" aria-label={t.errors.bulk.label} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/25 bg-brand-soft/60 px-4 py-2.5 text-sm">
            <span className="mr-auto">{t.errors.bulk.selected(fmt.number(selected.size))}</span>
            <Button size="sm" icon="checkCircle" loading={updateGroups.isPending} onClick={() => void applyStatus("resolved")}>
              {t.errors.bulk.resolve}
            </Button>
            <Menu
              label={t.errors.bulk.ignore}
              icon="eyeOff"
              size="sm"
              items={[
                { key: "24h", label: t.errors.bulk.ignore24h, onSelect: () => void applyStatus("ignored", 24) },
                { key: "7d", label: t.errors.bulk.ignore7d, onSelect: () => void applyStatus("ignored", 24 * 7) },
                { key: "forever", label: t.errors.bulk.ignoreForever, onSelect: () => void applyStatus("ignored") },
              ]}
            />
            <Button size="sm" variant="secondary" icon="refresh" loading={updateGroups.isPending} onClick={() => void applyStatus("active")}>
              {t.errors.bulk.reactivate}
            </Button>
          </div>
        )}

        <ErrorGroupsTable
          groups={data}
          capped={capped}
          loading={groups.isLoading}
          stale={stale}
          windowFrom={groups.data?.from}
          selection={isOwner ? { selected, onToggle: toggle, onToggleAll: toggleAll } : undefined}
          actions={(group) => (
            <>
              <CopyButton
                iconOnly
                icon="sparkles"
                variant="ghost"
                label={t.errors.copyAi}
                toast={t.toast.aiCopied}
                text={() => groupBrief(group)}
              />
              <ButtonLink
                size="sm"
                iconRight="arrowRight"
                href={`/logs?fingerprint=${encodeURIComponent(group.fingerprint)}${rangeQuery ? `&${rangeQuery}` : ""}`}
              >
                {t.errors.viewOccurrences}
              </ButtonLink>
            </>
          )}
        />
      </div>
      <ShareSnapshotDialog
        open={sharing}
        onClose={() => setSharing(false)}
        source={{ kind: "errors", range: filters.range, level: filters.level, application: filters.application, environment: filters.environment }}
        total={groups.data ? data.length : null}
      />
    </DashboardLayout>
  );
}

export default function ErrorsPage() {
  return (
    <Suspense fallback={null}>
      <ErrorsView />
    </Suspense>
  );
}
