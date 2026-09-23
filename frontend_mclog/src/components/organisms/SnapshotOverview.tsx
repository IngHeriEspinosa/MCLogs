"use client";
import React, { useMemo } from "react";
import { ActivityChart } from "@/components/molecules/ActivityChart";
import { Card } from "@/components/molecules/Card";
import { BarList, LevelMix } from "@/components/molecules/Distribution";
import { StatTile } from "@/components/molecules/StatTile";
import { useI18n } from "@/common/i18n/I18nProvider";
import { binTimeline, fillTimeline } from "@/common/time/timeline";
import type { SnapshotSummary } from "@/hooks/useSnapshots";

type SnapshotOverviewProps = {
  summary: SnapshotSummary;
  /** Fin del rango capturado: hasta donde llega la serie. */
  to: string;
};

/**
 * El resumen de un snapshot: la misma disposicion que el de la vista de logs,
 * pero con los datos guardados y sin interaccion. Filtrar llevaria a datos en
 * vivo, que quien mira un snapshot puede no tener derecho a ver.
 */
export const SnapshotOverview: React.FC<SnapshotOverviewProps> = ({ summary, to }) => {
  const { t, fmt } = useI18n();
  const hours = useMemo(() => fillTimeline(summary.timeline, summary.timelineFrom, to), [summary.timeline, summary.timelineFrom, to]);
  const trend = useMemo(() => binTimeline(hours, 24).bins, [hours]);
  const counts = summary.byLevel;
  const total = summary.total;
  const share = (count: number) => t.overview.ofRecords(fmt.percent(total ? count / total : 0));

  return (
    <section aria-label={t.logs.overview} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 3xl:gap-4">
        <StatTile
          label={t.overview.records}
          value={fmt.compact(total)}
          hint={t.overview.inRange}
          info={t.fieldInfo.metrics.records}
          icon="logs"
          accent="brand"
          trend={trend.map((bin) => bin.total)}
        />
        <StatTile
          label={t.overview.errors}
          value={fmt.compact(counts.error)}
          hint={share(counts.error)}
          info={t.fieldInfo.metrics.errors}
          icon="errors"
          accent="error"
          trend={trend.map((bin) => bin.error)}
        />
        <StatTile
          label={t.overview.warnings}
          value={fmt.compact(counts.warn)}
          hint={share(counts.warn)}
          info={t.fieldInfo.metrics.warnings}
          icon="alertCircle"
          accent="warn"
          trend={trend.map((bin) => bin.warn)}
        />
        <StatTile
          label={t.overview.distinctErrors}
          value={`${fmt.number(summary.distinctErrors)}${summary.distinctErrorsCapped ? "+" : ""}`}
          hint={t.overview.distinctHint}
          info={t.fieldInfo.metrics.distinctErrors}
          icon="hash"
        />
        <StatTile
          label={t.overview.apps}
          value={fmt.number(summary.applications)}
          hint={t.snapshots.viewer.appsHint(summary.applicationsWithErrors)}
          info={t.snapshots.viewer.info.apps}
          icon="box"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card title={t.overview.activity} info={t.snapshots.viewer.info.activity} className="xl:col-span-8 3xl:col-span-6">
          <ActivityChart hours={hours} height={260} />
        </Card>

        <Card title={t.overview.levelMix} info={t.snapshots.viewer.info.levelMix} description={t.overview.inRange} className="xl:col-span-4 3xl:col-span-2">
          <LevelMix counts={counts} />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 px-2 text-[0.8125rem] font-semibold text-ink">{t.overview.environments}</h3>
            <BarList
              items={summary.byEnvironment
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((row) => ({
                  key: row.environment,
                  label: t.envs.names[row.environment as keyof typeof t.envs.names] ?? row.environment,
                  value: row.count,
                }))}
              empty={t.overview.noActivity}
            />
          </div>
        </Card>

        <Card title={t.overview.topErrors} info={t.snapshots.viewer.info.topErrors} description={t.overview.inRange} className="xl:col-span-6 3xl:col-span-2">
          {summary.topErrors.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">{t.overview.topErrorsEmpty}</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {summary.topErrors.map((group) => (
                <li key={group.fingerprint} title={group.sampleMessage} className="flex items-start gap-3 rounded-lg px-2 py-2">
                  <span className="mt-0.5 inline-flex min-w-[2.75rem] justify-center rounded-md bg-lvl-error/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-danger">
                    {fmt.compact(group.count)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{group.errorName ?? t.errors.noClass}</span>
                    <span className="block truncate text-xs text-ink-3">
                      <span className="font-mono">{group.application}</span> · {fmt.dateTimeShort(group.lastSeen)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t.overview.topApps} info={t.snapshots.viewer.info.topApps} description={t.overview.inRange} className="xl:col-span-6 3xl:col-span-2">
          <BarList
            items={summary.byApplication.slice(0, 6).map((row) => ({ key: row.application, label: row.application, value: row.count }))}
            empty={t.overview.noActivity}
            mono
          />
        </Card>
      </div>
      <p className="-mt-1 text-[0.6875rem] text-ink-3">{t.snapshots.viewer.summaryNote}</p>
    </section>
  );
};
