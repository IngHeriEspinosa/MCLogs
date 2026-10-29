"use client";
import React, { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { Select } from "@/components/molecules/Select";
import { SavedViewsMenu } from "@/components/organisms/SavedViewsMenu";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
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
import { useNow } from "@/hooks/useNow";
import { TraceSummary, useTraces } from "@/hooks/useErrors";
import { useFilterOptions } from "@/hooks/useOptions";

const PRESETS: readonly Preset[] = ["15m", "1h", "6h", "24h", "7d", "30d"];
const PAGE_SIZE = 25;

/** Estado de una operacion a partir de sus cuentas, igual que en la pantalla de traza. */
const statusOf = (trace: TraceSummary) => (trace.errors > 0 ? "failed" : trace.warnings > 0 ? "warn" : "ok");
const STATUS_TONE = { ok: "success", warn: "warning", failed: "danger" } as const;

function TracesView() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const options = useFilterOptions();

  // Filtros en la URL, como en Logs y Errores: un enlace reproduce la vista.
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const range = rangeFromParams(params);
  const application = params.get("application") ?? "";
  const environment = params.get("environment") ?? "";
  const onlyErrors = params.get("onlyErrors") === "true";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const update = (patch: { range?: TimeRange; application?: string; environment?: string; onlyErrors?: boolean; page?: number }) => {
    const next = new URLSearchParams();
    const nextRange = patch.range ?? range;
    if (!sameRange(nextRange, DEFAULT_RANGE)) {
      Object.entries(rangeToParams(nextRange)).forEach(([key, value]) => value && next.set(key, value));
    }
    const values = { application, environment, onlyErrors, ...patch, page: patch.page ?? 1 };
    if (values.application) next.set("application", values.application);
    if (values.environment) next.set("environment", values.environment);
    if (values.onlyErrors) next.set("onlyErrors", "true");
    if (values.page > 1) next.set("page", String(values.page));
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const [now] = useNow(isRelative(range) && page === 1, JSON.stringify(range));
  const isAll = isRelative(range) && range.preset === "all";
  const bounds = queryWindow(range, now);
  const traces = useTraces({
    ...(isAll ? { hours: MAX_TIMELINE_HOURS } : { from: bounds.from?.toISOString(), to: bounds.to?.toISOString() }),
    application: application || undefined,
    environment: environment || undefined,
    onlyErrors,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = traces.data?.data ?? [];

  return (
    <DashboardLayout
      title={t.traces.title}
      eyebrow={t.traces.eyebrow}
      description={t.traces.description}
      presentable
      autoRefresh
      actions={<SavedViewsMenu path="/traces" />}
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-auto sm:min-w-[15rem]">
            <DateRangePicker value={range} onChange={(next) => update({ range: next })} presets={PRESETS} />
          </div>
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
          <Checkbox checked={onlyErrors} onChange={(checked) => update({ onlyErrors: checked })} label={t.traces.onlyErrors} />
        </div>

        <p className="text-xs text-ink-3">{t.traces.scopeNote}</p>

        {traces.isError && <Alert variant="error" title={t.traces.loadError}>{errorMessage(traces.error, t.common.unknownError)}</Alert>}

        <section className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-opacity ${traces.isFetching && !traces.isLoading ? "opacity-60" : ""}`}>
          {traces.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon="route" title={t.traces.empty} description={t.traces.emptyHint} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t.traces.title}</caption>
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th scope="col" className="border-b border-line px-5 py-2.5 font-medium">{t.traces.columns.start}</th>
                    <th scope="col" className="border-b border-line px-3 py-2.5 font-medium">{t.traces.columns.operation}</th>
                    <th scope="col" className="hidden border-b border-line px-3 py-2.5 font-medium lg:table-cell">{t.traces.columns.services}</th>
                    <th scope="col" className="border-b border-line px-3 py-2.5 text-right font-medium">{t.traces.columns.records}</th>
                    <th scope="col" className="border-b border-line px-3 py-2.5 text-right font-medium">{t.traces.columns.duration}</th>
                    <th scope="col" className="border-b border-line px-5 py-2.5 font-medium">{t.traces.columns.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((trace) => {
                    const status = statusOf(trace);
                    return (
                      <tr key={trace.traceId} className="transition-colors hover:bg-surface-2">
                        <td className="whitespace-nowrap border-b border-line px-5 py-3">
                          <p className="font-mono text-xs text-ink">{fmt.dateTimeShort(trace.start)}</p>
                          <p className="text-[0.6875rem] text-ink-3">{fmt.relative(trace.end, now)}</p>
                        </td>
                        <td className="max-w-[18rem] border-b border-line px-3 py-3">
                          <Link href={`/trace/${encodeURIComponent(trace.traceId)}`} className="block truncate font-mono text-xs font-medium">
                            {trace.traceId}
                          </Link>
                          <p className="truncate text-[0.6875rem] text-ink-3">{trace.applications.join(", ")}</p>
                        </td>
                        <td className="hidden border-b border-line px-3 py-3 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {trace.services.slice(0, 4).map((service) => (
                              <Tag key={service} mono>
                                {service}
                              </Tag>
                            ))}
                            {trace.services.length > 4 && <span className="text-xs text-ink-3">+{trace.services.length - 4}</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-3 py-3 text-right tabular-nums">
                          {fmt.number(trace.count)}
                          {trace.errors > 0 && <span className="block text-[0.6875rem] text-danger">{t.traces.errorsCount(fmt.number(trace.errors))}</span>}
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-3 py-3 text-right font-mono text-xs tabular-nums">
                          {fmt.duration(trace.durationMs)}
                        </td>
                        <td className="border-b border-line px-5 py-3">
                          <Tag tone={STATUS_TONE[status]}>{t.trace.status[status]}</Tag>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {traces.data && traces.data.totalPages > 1 && (
            <nav aria-label={t.traces.pagination} className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-ink-3">
              <span>{t.traces.pageOf(fmt.number(page), fmt.number(traces.data.totalPages), fmt.number(traces.data.total))}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon="chevronLeft" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                  {t.logs.prevPage}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  iconRight="chevronRight"
                  disabled={page >= traces.data.totalPages}
                  onClick={() => update({ page: page + 1 })}
                >
                  {t.logs.nextPage}
                </Button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

export default function TracesPage() {
  return (
    <Suspense fallback={null}>
      <TracesView />
    </Suspense>
  );
}
