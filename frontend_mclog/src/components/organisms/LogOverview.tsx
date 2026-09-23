"use client";
import React, { useMemo } from "react";
import Link from "next/link";
import { Level } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ActivityChart } from "@/components/molecules/ActivityChart";
import { Card } from "@/components/molecules/Card";
import { BarList, LevelMix } from "@/components/molecules/Distribution";
import { StatTile } from "@/components/molecules/StatTile";
import { useI18n } from "@/common/i18n/I18nProvider";
import { isRelative, MAX_TIMELINE_HOURS, rangeToParams, resolveRange, TimeRange } from "@/common/time/range";
import { binTimeline, fillTimeline, sumLevels } from "@/common/time/timeline";
import { useLogStats } from "@/hooks/useAuth";
import { useApplications, useErrorGroups } from "@/hooks/useErrors";

type LogOverviewProps = {
  range: TimeRange;
  /** Instante de referencia de los rangos relativos. */
  now: number;
  application: string;
  environment: string;
  onSelectRange: (from: number, to: number) => void;
  onSelectLevel: (level: Level) => void;
  onSelectApplication: (application: string) => void;
  onSelectEnvironment: (environment: string) => void;
  onSelectFingerprint: (fingerprint: string) => void;
};

/**
 * Resumen de la vista de logs: metricas, actividad, mezcla de niveles y los
 * fallos y aplicaciones que mas pesan. Todo responde al mismo rango, aplicacion
 * y entorno que la tabla; los clics en los graficos se convierten en filtros.
 */
export const LogOverview: React.FC<LogOverviewProps> = ({
  range,
  now,
  application,
  environment,
  onSelectRange,
  onSelectLevel,
  onSelectApplication,
  onSelectEnvironment,
  onSelectFingerprint,
}) => {
  const { t, fmt } = useI18n();
  const isAll = isRelative(range) && range.preset === "all";
  const resolved = resolveRange(range, now);
  const span = isAll
    ? { hours: MAX_TIMELINE_HOURS }
    : { from: resolved.from?.toISOString(), to: resolved.to?.toISOString() };
  const scope = { application: application || undefined, environment: environment || undefined };

  const stats = useLogStats({ ...span, ...scope });
  const groups = useErrorGroups({ ...span, ...scope, level: "error", limit: 100 });
  const applications = useApplications();

  const hours = useMemo(
    () => (stats.data ? fillTimeline(stats.data.timeline ?? [], stats.data.from, stats.data.to) : []),
    [stats.data],
  );
  const trend = useMemo(() => binTimeline(hours, 24).bins, [hours]);

  // En "todo el historico" la serie solo cubre los ultimos 31 dias, asi que
  // las cifras salen de los totales historicos y no de sumar la serie.
  const counts = useMemo(() => {
    if (isAll && stats.data) {
      const byLevel = (level: string) => stats.data?.byLevel.find((row) => row.level === level)?.count ?? 0;
      return { total: stats.data.total, error: byLevel("error"), warn: byLevel("warn"), info: byLevel("info"), debug: byLevel("debug") };
    }
    return sumLevels(hours);
  }, [isAll, stats.data, hours]);

  const loading = stats.isLoading;
  const stale = stats.isFetching && !stats.isLoading;
  const scopeHint = isAll ? t.overview.allTime : t.overview.inRange;
  const groupList = groups.data?.data ?? [];
  const appsWithErrors = (applications.data ?? []).filter((app) => app.errorsLast24h > 0).length;
  const errorRate = counts.total ? counts.error / counts.total : 0;
  const rangeQuery = new URLSearchParams(
    Object.entries(rangeToParams(range)).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <section aria-label={t.logs.overview} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 3xl:gap-4">
        <StatTile
          label={t.overview.records}
          value={fmt.compact(counts.total)}
          hint={scopeHint}
          info={t.fieldInfo.metrics.records}
          icon="logs"
          accent="brand"
          trend={trend.map((bin) => bin.total)}
          loading={loading}
          stale={stale}
        />
        <StatTile
          label={t.overview.errors}
          value={fmt.compact(counts.error)}
          hint={t.overview.ofRecords(fmt.percent(errorRate))}
          info={t.fieldInfo.metrics.errors}
          icon="errors"
          accent="error"
          trend={trend.map((bin) => bin.error)}
          loading={loading}
          stale={stale}
        />
        <StatTile
          label={t.overview.warnings}
          value={fmt.compact(counts.warn)}
          hint={t.overview.ofRecords(fmt.percent(counts.total ? counts.warn / counts.total : 0))}
          info={t.fieldInfo.metrics.warnings}
          icon="alertCircle"
          accent="warn"
          trend={trend.map((bin) => bin.warn)}
          loading={loading}
          stale={stale}
        />
        <StatTile
          label={t.overview.distinctErrors}
          value={`${fmt.number(groupList.length)}${groupList.length >= 100 ? "+" : ""}`}
          hint={t.overview.distinctHint}
          info={t.fieldInfo.metrics.distinctErrors}
          icon="hash"
          accent="neutral"
          loading={groups.isLoading}
          stale={groups.isFetching && !groups.isLoading}
        />
        <StatTile
          label={t.overview.apps}
          value={fmt.number(applications.data?.length ?? 0)}
          hint={t.overview.appsHint(appsWithErrors)}
          info={t.fieldInfo.metrics.apps}
          icon="box"
          accent="neutral"
          loading={applications.isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card
          title={t.overview.activity}
          info={t.fieldInfo.metrics.activity}
          description={isAll ? t.overview.last31d : isRelative(range) ? t.time.presets[range.preset] : t.time.custom}
          className="xl:col-span-8 3xl:col-span-6"
        >
          <ActivityChart hours={hours} loading={loading} stale={stale} onSelectRange={onSelectRange} height={260} />
        </Card>

        <Card title={t.overview.levelMix} info={t.fieldInfo.metrics.levelMix} description={scopeHint} className="xl:col-span-4 3xl:col-span-2">
          <LevelMix counts={counts} onSelect={onSelectLevel} loading={loading} />
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2 px-2">
              <h3 className="text-[0.8125rem] font-semibold text-ink">{t.overview.environments}</h3>
              <span className="text-xs text-ink-3">{t.overview.topAppsHint}</span>
            </div>
            <BarList
              items={(stats.data?.byEnvironment ?? [])
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((row) => ({
                  key: row.environment,
                  label: t.envs.names[row.environment as keyof typeof t.envs.names] ?? row.environment,
                  value: row.count,
                }))}
              onSelect={onSelectEnvironment}
              loading={loading}
              empty={t.overview.noActivity}
            />
          </div>
        </Card>

        <Card
          title={t.overview.topErrors}
          info={t.fieldInfo.metrics.topErrors}
          description={scopeHint}
          actions={
            <Link href={`/errors${rangeQuery ? `?${rangeQuery}` : ""}`} className="text-xs font-medium">
              {t.overview.viewAll}
            </Link>
          }
          className="xl:col-span-6 3xl:col-span-2"
        >
          {groups.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : groupList.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">{t.overview.topErrorsEmpty}</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {groupList.slice(0, 5).map((group) => (
                <li key={group.fingerprint}>
                  <button
                    type="button"
                    onClick={() => onSelectFingerprint(group.fingerprint)}
                    title={group.sampleMessage}
                    className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="mt-0.5 inline-flex min-w-[2.75rem] justify-center rounded-md bg-lvl-error/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-danger">
                      {fmt.compact(group.count)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {group.errorName ?? t.errors.noClass}
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        <span className="font-mono">{group.application}</span> · {fmt.relative(group.lastSeen)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t.overview.topApps}
          info={t.fieldInfo.metrics.topApps}
          description={t.overview.topAppsHint}
          className="xl:col-span-6 3xl:col-span-2"
        >
          <BarList
            items={(stats.data?.byApplication ?? []).slice(0, 6).map((row) => ({
              key: row.application,
              label: row.application,
              value: row.count,
            }))}
            onSelect={onSelectApplication}
            loading={loading}
            empty={t.overview.noActivity}
            mono
          />
        </Card>
      </div>
      <p className="-mt-1 text-[0.6875rem] text-ink-3">{t.overview.scopeNote}</p>
    </section>
  );
};
