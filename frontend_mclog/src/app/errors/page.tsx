"use client";
import React, { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Segmented } from "@/components/atoms/Segmented";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { Menu } from "@/components/molecules/Menu";
import { Select } from "@/components/molecules/Select";
import { ErrorGroupsTable, ErrorKpis } from "@/components/organisms/ErrorGroups";
import { ShareSnapshotDialog } from "@/components/organisms/ShareSnapshotDialog";
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
  const { t, locale } = useI18n();
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
  const [sharing, setSharing] = useState(false);
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
        <>
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

        <ErrorKpis groups={data} level={level} loading={groups.isLoading} stale={stale} />

        {groups.isError && <Alert variant="error" title={t.errors.loadError}>{errorMessage(groups.error, t.common.unknownError)}</Alert>}

        <ErrorGroupsTable
          groups={data}
          loading={groups.isLoading}
          stale={stale}
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
        source={{ kind: "errors", range, level, application, environment }}
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
