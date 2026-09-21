"use client";
import React, { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { ButtonLink } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { LevelBadge } from "@/components/atoms/LevelBadge";
import { Segmented } from "@/components/atoms/Segmented";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { Menu } from "@/components/molecules/Menu";
import { Select } from "@/components/molecules/Select";
import { StatTile } from "@/components/molecules/StatTile";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import client from "@/common/api/client";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildGroupBrief } from "@/common/reports/build";
import { isRelative, MAX_TIMELINE_HOURS, Preset, rangeFromParams, rangeToParams, resolveRange, sameRange, TimeRange, DEFAULT_RANGE } from "@/common/time/range";
import type { LogEntry } from "@/hooks/useAuth";
import { ErrorGroup, useErrorGroups } from "@/hooks/useErrors";
import { useFilterOptions } from "@/hooks/useOptions";

const PRESETS: readonly Preset[] = ["1h", "6h", "24h", "7d", "30d"];

function ErrorsView() {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const options = useFilterOptions();

  // Filtros en la URL, igual que en la vista de logs: el enlace "Ver todos"
  // del resumen llega aqui con el mismo rango.
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const range = rangeFromParams(params);
  const level = params.get("level") === "warn" ? "warn" : "error";
  const environment = params.get("environment") ?? "";
  const application = params.get("application") ?? "";

  const update = (patch: { range?: TimeRange; level?: string; environment?: string; application?: string }) => {
    const next = new URLSearchParams();
    const nextRange = patch.range ?? range;
    if (!sameRange(nextRange, DEFAULT_RANGE)) {
      Object.entries(rangeToParams(nextRange)).forEach(([key, value]) => value && next.set(key, value));
    }
    const values = { level, environment, application, ...patch };
    if (values.level && values.level !== "error") next.set("level", values.level);
    if (values.environment) next.set("environment", values.environment);
    if (values.application) next.set("application", values.application);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // El instante de referencia se fija con el rango para que la consulta sea estable.
  const rangeKey = JSON.stringify(range);
  const span = useMemo(() => {
    if (isRelative(range) && range.preset === "all") return { hours: MAX_TIMELINE_HOURS };
    const resolved = resolveRange(range, Date.now());
    return { from: resolved.from?.toISOString(), to: resolved.to?.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const groups = useErrorGroups({
    ...span,
    level,
    application: application || undefined,
    environment: environment || undefined,
    limit: 100,
  });

  const data = groups.data?.data ?? [];
  const occurrences = data.reduce((sum, group) => sum + group.count, 0);
  const max = Math.max(1, ...data.map((group) => group.count));
  const byApp = new Map<string, number>();
  data.forEach((group) => byApp.set(group.application, (byApp.get(group.application) ?? 0) + group.count));
  const topApp = [...byApp.entries()].sort((a, b) => b[1] - a[1])[0];
  const stale = groups.isFetching && !groups.isLoading;

  const rangeQuery = Object.entries(rangeToParams(range))
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const openReport = (kind: "markdown" | "agent-md") => {
    const query = new URLSearchParams({ kind, generate: "1" });
    Object.entries(rangeToParams(range)).forEach(([key, value]) => value && query.set(key, value));
    if (application) query.set("application", application);
    if (environment) query.set("environment", environment);
    router.push(`/reports?${query.toString()}`);
  };

  const groupBrief = async (group: ErrorGroup) => {
    const sample = await client
      .get<LogEntry>(`/api/logs/${group.lastLogId}`)
      .then((response) => response.data)
      .catch(() => null);
    return buildGroupBrief(group, sample, locale);
  };

  return (
    <DashboardLayout
      title={t.errors.title}
      eyebrow={t.errors.eyebrow}
      description={t.errors.description}
      actions={
        <Menu
          label={t.logs.exportReports}
          icon="report"
          variant="primary"
          items={[
            { key: "md", label: t.logs.exportMd, hint: t.logs.exportMdHint, icon: "report", onSelect: () => openReport("markdown") },
            { key: "ai", label: t.logs.exportAi, hint: t.logs.exportAiHint, icon: "sparkles", onSelect: () => openReport("agent-md") },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-auto sm:min-w-[15rem]">
            <DateRangePicker value={range} onChange={(next) => update({ range: next })} presets={PRESETS} />
          </div>
          <Segmented
            label={t.levels.label}
            value={level}
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
              value={environment}
              onChange={(next) => update({ environment: next })}
              options={options.environments}
            />
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-56">
            <Select
              label={t.logs.application}
              icon="box"
              value={application}
              onChange={(next) => update({ application: next })}
              options={options.apps}
              searchable
              allowCustom
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 3xl:gap-4">
          <StatTile
            label={t.errors.kpiGroups}
            value={`${fmt.number(data.length)}${data.length >= 100 ? "+" : ""}`}
            icon="hash"
            accent={level === "warn" ? "warn" : "error"}
            loading={groups.isLoading}
            stale={stale}
          />
          <StatTile
            label={t.errors.kpiOccurrences}
            value={fmt.compact(occurrences)}
            icon="activity"
            accent="neutral"
            loading={groups.isLoading}
            stale={stale}
          />
          <StatTile
            label={t.errors.kpiTopApp}
            value={<span className="font-mono text-[1.375rem]">{topApp ? topApp[0] : "—"}</span>}
            hint={topApp ? t.errors.occurrencesCount(fmt.number(topApp[1])) : undefined}
            icon="box"
            accent="neutral"
            loading={groups.isLoading}
            stale={stale}
          />
          <StatTile
            label={t.errors.kpiTopShare}
            value={fmt.percent(data[0] && occurrences ? data[0].count / occurrences : 0)}
            hint={t.errors.kpiTopShareHint}
            icon="chart"
            accent="brand"
            loading={groups.isLoading}
            stale={stale}
          />
        </div>

        {groups.isError && <Alert variant="error" title={t.errors.loadError}>{errorMessage(groups.error, t.common.unknownError)}</Alert>}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {groups.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <EmptyState icon="checkCircle" title={t.errors.empty} description={t.errors.emptyHint} />
          ) : (
            <div className={`overflow-x-auto transition-opacity ${stale ? "opacity-70" : ""}`}>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    {[
                      { label: t.errors.columns.count, className: "pl-5 w-32" },
                      { label: t.errors.columns.error, className: "w-full" },
                      { label: t.errors.columns.application, className: "hidden lg:table-cell" },
                      { label: t.errors.columns.level, className: "hidden md:table-cell" },
                      { label: t.errors.columns.activity, className: "hidden xl:table-cell" },
                      { label: "", className: "" },
                    ].map((column, index) => (
                      <th
                        key={index}
                        scope="col"
                        className={`whitespace-nowrap border-b border-line px-3 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 ${column.className}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((group) => (
                    <tr key={group.fingerprint} className="group align-top transition-colors hover:bg-surface-2">
                      <td className="border-b border-line py-3.5 pl-5 pr-3">
                        <p className="font-mono text-lg font-semibold tabular-nums leading-none text-ink">{fmt.compact(group.count)}</p>
                        <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <div
                            className={`h-full rounded-full ${group.level === "warn" ? "bg-lvl-warn" : "bg-lvl-error"}`}
                            style={{ width: `${Math.max(4, (group.count / max) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 whitespace-nowrap text-[0.6875rem] text-ink-3">
                          {t.errors.share(fmt.percent(occurrences ? group.count / occurrences : 0))}
                        </p>
                      </td>
                      <td className="w-full max-w-0 border-b border-line px-3 py-3.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-medium text-ink">{group.errorName ?? t.errors.noClass}</span>
                          {group.errorCode && (
                            <Tag mono tone="neutral">
                              {group.errorCode}
                            </Tag>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words font-mono text-[0.8125rem] leading-relaxed text-ink-2" title={group.sampleMessage}>
                          {group.sampleMessage}
                        </p>
                        <p className="mt-1 font-mono text-[0.6875rem] text-ink-3">
                          #{group.fingerprint.slice(0, 12)}
                          <span className="lg:hidden"> · {group.application}</span>
                        </p>
                      </td>
                      <td className="hidden whitespace-nowrap border-b border-line px-3 py-3.5 lg:table-cell">
                        <p className="font-mono text-[0.8125rem] text-ink">{group.application}</p>
                        {group.service && group.service !== group.application && (
                          <p className="font-mono text-xs text-ink-3">{group.service}</p>
                        )}
                      </td>
                      <td className="hidden border-b border-line px-3 py-3.5 md:table-cell">
                        <LevelBadge level={group.level} />
                      </td>
                      <td className="hidden whitespace-nowrap border-b border-line px-3 py-3.5 text-xs xl:table-cell">
                        <p className="text-ink-2" title={fmt.dateTime(group.lastSeen)}>
                          {t.errors.lastSeen(fmt.relative(group.lastSeen))}
                        </p>
                        <p className="mt-0.5 text-ink-3" title={fmt.dateTime(group.firstSeen)}>
                          {t.errors.firstSeen(fmt.relative(group.firstSeen))}
                        </p>
                      </td>
                      <td className="whitespace-nowrap border-b border-line py-3.5 pl-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
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
                            href={`/?fingerprint=${encodeURIComponent(group.fingerprint)}${rangeQuery ? `&${rangeQuery}` : ""}`}
                          >
                            {t.errors.viewOccurrences}
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length >= 100 && <p className="px-5 py-3 text-xs text-ink-3">{t.errors.capped}</p>}
            </div>
          )}
        </section>
      </div>
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
