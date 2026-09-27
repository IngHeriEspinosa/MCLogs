"use client";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Input } from "@/components/atoms/Input";
import { Segmented } from "@/components/atoms/Segmented";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag, TagTone } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { Select } from "@/components/molecules/Select";
import { StatTile } from "@/components/molecules/StatTile";
import { useToast } from "@/components/molecules/Toast";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { Dictionary } from "@/common/i18n/dictionaries";
import {
  API_KEY_RISKS,
  ApiKeyRisk,
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilters,
  InventoryKey,
  InventoryThresholds,
  InventoryView,
  RISK_SEVERITY,
  RiskSeverity,
  countByView,
  filterInventory,
  inventoryWorkspaces,
  sortInventory,
} from "@/common/keys/inventory";
import { ApiKeyScope } from "@/hooks/useApiKeys";
import { useMe } from "@/hooks/useAuth";
import { useKeyInventory, useRevokeAnyKey } from "@/hooks/useKeyInventory";
import { useWorkspace } from "@/hooks/useWorkspaces";

const SCOPES: ApiKeyScope[] = ["ingest", "read", "metrics"];
const VIEWS: InventoryView[] = ["attention", "active", "inactive", "all"];

const SEVERITY_TONE: Record<RiskSeverity, TagTone> = { high: "danger", medium: "warning", low: "neutral" };

/** Explicacion de un aviso con el umbral que se aplico, tal como lo devuelve el backend. */
const riskHelp = (t: Dictionary, risk: ApiKeyRisk, thresholds: InventoryThresholds): string => {
  const copy = t.keyInventory.risks;
  switch (risk) {
    case "stale":
      return copy.stale.help(thresholds.staleAfterDays);
    case "never-used":
      return copy["never-used"].help(thresholds.neverUsedGraceDays);
    case "expiring-soon":
      return copy["expiring-soon"].help(thresholds.expiringSoonDays);
    default:
      return copy[risk].help;
  }
};

const RiskTag: React.FC<{ risk: ApiKeyRisk; thresholds: InventoryThresholds }> = ({ risk, thresholds }) => {
  const { t } = useI18n();
  const severity = RISK_SEVERITY[risk];
  return (
    <Tag tone={SEVERITY_TONE[severity]} icon={severity === "high" ? "alertCircle" : undefined} title={riskHelp(t, risk, thresholds)}>
      {t.keyInventory.risks[risk].label}
    </Tag>
  );
};

const Summary: React.FC<{ loading: boolean; summary?: InventorySummaryProps }> = ({ loading, summary }) => {
  const { t, fmt } = useI18n();
  const copy = t.keyInventory.tiles;
  const value = (n: number | undefined) => (n === undefined ? "—" : fmt.number(n));
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 3xl:gap-4">
      <StatTile
        label={copy.active}
        value={value(summary?.active)}
        hint={summary ? copy.activeHint(summary.inactive) : undefined}
        icon="key"
        accent="brand"
        loading={loading}
      />
      <StatTile label={copy.read} value={value(summary?.activeRead)} hint={copy.readHint} icon="eye" accent="info" loading={loading} />
      <StatTile
        label={copy.risks}
        value={value(summary?.withRisks)}
        hint={copy.risksHint}
        icon="alertCircle"
        accent={summary && summary.withRisks > 0 ? "warn" : "neutral"}
        loading={loading}
      />
      <StatTile
        label={copy.mcp}
        value={value(summary?.mcpActive)}
        hint={summary ? copy.mcpHint(summary.mcpActiveDays) : undefined}
        icon="bot"
        accent="neutral"
        loading={loading}
      />
      <StatTile
        label={copy.workspaces}
        value={value(summary?.workspaces)}
        hint={copy.workspacesHint}
        icon="layers"
        accent="neutral"
        loading={loading}
      />
    </div>
  );
};

type InventorySummaryProps = {
  active: number;
  inactive: number;
  activeRead: number;
  withRisks: number;
  mcpActive: number;
  mcpActiveDays: number;
  workspaces: number;
};

const Filters: React.FC<{
  filters: InventoryFilters;
  onChange: (patch: Partial<InventoryFilters>) => void;
  counts: Record<InventoryView, number>;
  workspaces: { id: number; name: string }[];
}> = ({ filters, onChange, counts, workspaces }) => {
  const { t } = useI18n();
  const copy = t.keyInventory.filters;
  const dirty =
    filters.query !== "" ||
    filters.scope !== "all" ||
    filters.workspaceId !== "all" ||
    filters.view !== DEFAULT_INVENTORY_FILTERS.view;

  return (
    <div role="search" aria-label={copy.label} className="flex flex-col gap-3 border-b border-line px-5 py-4">
      <Segmented
        size="sm"
        label={copy.view}
        value={filters.view}
        onChange={(view) => onChange({ view })}
        options={VIEWS.map((view) => ({ value: view, label: `${copy.views[view]} · ${counts[view]}` }))}
      />
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
        <Input
          icon="search"
          size="sm"
          type="search"
          aria-label={copy.search}
          placeholder={copy.searchPlaceholder}
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
        />
        <Select
          size="sm"
          icon="lock"
          label={copy.scope}
          value={filters.scope}
          onChange={(scope) => onChange({ scope })}
          options={[
            { value: "all" as const, label: copy.allScopes },
            ...SCOPES.map((scope) => ({ value: scope, label: `${scope} · ${t.apiKeys.scopeDescriptions[scope]}` })),
          ]}
        />
        <Select
          size="sm"
          icon="layers"
          label={copy.workspace}
          searchable={workspaces.length > 8}
          value={String(filters.workspaceId)}
          onChange={(value) => onChange({ workspaceId: value === "all" ? "all" : Number(value) })}
          options={[
            { value: "all", label: copy.allWorkspaces },
            ...workspaces.map((workspace) => ({ value: String(workspace.id), label: workspace.name })),
          ]}
        />
        <Button size="sm" variant="ghost" icon="x" disabled={!dirty} onClick={() => onChange(DEFAULT_INVENTORY_FILTERS)}>
          {copy.clear}
        </Button>
      </div>
    </div>
  );
};

const KeyRow: React.FC<{
  apiKey: InventoryKey;
  thresholds: InventoryThresholds;
  onOpenWorkspace: (id: number) => void;
}> = ({ apiKey, thresholds, onOpenWorkspace }) => {
  const { t, fmt } = useI18n();
  const copy = t.keyInventory;
  const notify = useToast();
  const revoke = useRevokeAnyKey();
  const active = apiKey.status === "active";
  const cell = "border-b border-line px-4 py-3 align-top";

  return (
    <>
      <tr className={`transition-colors hover:bg-surface-2 ${active ? "" : "opacity-60"}`}>
        <td className={`${cell} min-w-[13rem] pl-5`}>
          <p className="font-medium text-ink">{apiKey.name}</p>
          <p className="font-mono text-xs text-ink-2">{apiKey.prefix}…</p>
          <p className="mt-0.5 max-w-[15rem] truncate text-xs text-ink-3" title={apiKey.createdBy?.email}>
            {apiKey.createdBy ? copy.createdBy(apiKey.createdBy.email) : copy.createdBySystem}
          </p>
          <p className="text-xs text-ink-3">{fmt.date(apiKey.createdAt)}</p>
        </td>
        <td className={cell}>
          <button
            type="button"
            onClick={() => onOpenWorkspace(apiKey.workspace.id)}
            title={copy.openWorkspace(apiKey.workspace.name)}
            className="max-w-[10rem] truncate text-left text-sm font-medium text-brand-ink hover:underline focus-visible:underline"
          >
            {apiKey.workspace.name}
          </button>
        </td>
        <td className={`${cell} max-w-[11rem]`}>
          <div className="flex flex-wrap gap-1">
            {apiKey.scopes.map((scope) => (
              <Tag key={scope} mono tone={scope === "ingest" ? "brand" : scope === "read" ? "info" : "neutral"}>
                {scope}
              </Tag>
            ))}
          </div>
          <p className="mt-1 break-words font-mono text-xs text-ink-2" title={copy.columns.applications}>
            {apiKey.applications.length > 0 ? apiKey.applications.join(", ") : t.apiKeys.allApps}
          </p>
        </td>
        <td className={`${cell} whitespace-nowrap text-xs text-ink-2`}>
          <span title={apiKey.lastUsedAt ? fmt.dateTime(apiKey.lastUsedAt) : undefined}>
            {apiKey.lastUsedAt ? fmt.relative(apiKey.lastUsedAt) : t.apiKeys.never}
          </span>
          {apiKey.lastMcpUsedAt && (
            <span className="mt-0.5 block text-ink-3" title={fmt.dateTime(apiKey.lastMcpUsedAt)}>
              {t.apiKeys.mcpUsed(fmt.relative(apiKey.lastMcpUsedAt))}
            </span>
          )}
        </td>
        <td className={cell}>
          <Tag tone={apiKey.status === "revoked" ? "danger" : apiKey.status === "expired" ? "warning" : "success"}>
            {t.apiKeys.status[apiKey.status]}
          </Tag>
          {apiKey.expiresAt && (
            <p className="mt-1 text-xs text-ink-3">
              {t.apiKeys.columns.expires}:<span className="block whitespace-nowrap">{fmt.date(apiKey.expiresAt)}</span>
            </p>
          )}
        </td>
        <td className={cell}>
          {apiKey.risks.length > 0 ? (
            <ul className="flex max-w-[13rem] flex-wrap gap-1">
              {apiKey.risks.map((risk) => (
                <li key={risk}>
                  <RiskTag risk={risk} thresholds={thresholds} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-ink-3">{active ? copy.noRisks : "—"}</span>
          )}
        </td>
        <td className={`${cell} whitespace-nowrap pr-5 text-right`}>
          {active && (
            <ConfirmButton
              onConfirm={() =>
                revoke.mutate(apiKey.id, { onSuccess: () => notify(copy.revoked(apiKey.name)) })
              }
              confirmLabel={copy.confirmRevoke}
              pending={revoke.isPending}
              icon="lock"
            >
              {copy.revoke}
            </ConfirmButton>
          )}
        </td>
      </tr>
      {revoke.isError && (
        <tr>
          <td colSpan={7} className="border-b border-line bg-surface-2/70 px-5 py-3">
            <Alert variant="error">{errorMessage(revoke.error, t.common.unknownError)}</Alert>
          </td>
        </tr>
      )}
    </>
  );
};

const Legend: React.FC<{ thresholds: InventoryThresholds }> = ({ thresholds }) => {
  const { t } = useI18n();
  return (
    <Card title={t.keyInventory.legendTitle} divider>
      <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {API_KEY_RISKS.map((risk) => (
          <div key={risk} className="flex flex-col gap-1">
            <dt>
              <RiskTag risk={risk} thresholds={thresholds} />
            </dt>
            <dd className="text-xs leading-relaxed text-ink-2">{riskHelp(t, risk, thresholds)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};

export default function KeyInventoryPage() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const { switchTo } = useWorkspace();
  const isAdmin = me.data?.role === "admin";
  const inventory = useKeyInventory(isAdmin);
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);

  const keys = inventory.data?.data;
  const rows = useMemo(() => (keys ? sortInventory(filterInventory(keys, filters)) : []), [keys, filters]);
  const counts = useMemo(() => countByView(keys ?? []), [keys]);
  const workspaces = useMemo(() => inventoryWorkspaces(keys ?? []), [keys]);

  if (me.isSuccess && !isAdmin) {
    return (
      <DashboardLayout title={t.keyInventory.title} eyebrow={t.keyInventory.eyebrow} width="narrow">
        <Alert variant="error">{t.common.adminOnly}</Alert>
      </DashboardLayout>
    );
  }

  // Abrir el espacio de una clave: el admin es dueño implicito de todos.
  const openWorkspace = (id: number) => {
    switchTo(id);
    router.push("/settings/api-keys");
  };

  const data = inventory.data;
  const copy = t.keyInventory;

  return (
    <DashboardLayout title={copy.title} eyebrow={copy.eyebrow} description={copy.description}>
      <div className="flex flex-col gap-4 3xl:gap-5">
        <Summary
          loading={inventory.isLoading || me.isLoading}
          summary={data ? { ...data.summary, mcpActiveDays: data.thresholds.mcpActiveDays } : undefined}
        />

        {data?.legacyKey.enabled && <Alert variant="info">{copy.legacy}</Alert>}

        <Card
          title={data ? `${copy.title} · ${copy.shown(rows.length, data.data.length)}` : copy.title}
          divider
          flush
        >
          {inventory.isLoading || me.isLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : inventory.isError ? (
            <div className="p-5">
              <Alert variant="error">{errorMessage(inventory.error, copy.loadError)}</Alert>
            </div>
          ) : !data || data.data.length === 0 ? (
            <EmptyState icon="key" title={copy.empty} description={copy.emptyHint} />
          ) : (
            <>
              <Filters
                filters={filters}
                onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
                counts={counts}
                workspaces={workspaces}
              />
              {rows.length === 0 ? (
                <EmptyState icon="search" title={copy.noMatches} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="bg-surface-2 text-left">
                        {[
                          copy.columns.key,
                          copy.columns.workspace,
                          copy.columns.access,
                          copy.columns.lastUsed,
                          copy.columns.status,
                          copy.columns.risks,
                          "",
                        ].map((label, index) => (
                          <th
                            key={index}
                            scope="col"
                            className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 first:pl-5"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((apiKey) => (
                        <KeyRow key={apiKey.id} apiKey={apiKey} thresholds={data.thresholds} onOpenWorkspace={openWorkspace} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-5 py-3 text-xs text-ink-3">{copy.revokeNote}</p>
            </>
          )}
        </Card>

        {data && <Legend thresholds={data.thresholds} />}
      </div>
    </DashboardLayout>
  );
}
