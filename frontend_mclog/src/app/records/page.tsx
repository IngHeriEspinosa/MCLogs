"use client";
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconButton } from "@/components/atoms/Button";
import { Card } from "@/components/molecules/Card";
import { AdvancedLogSearch } from "@/components/organisms/AdvancedLogSearch";
import { LogFilterBar } from "@/components/organisms/LogFilterBar";
import { LogInspector } from "@/components/organisms/LogInspector";
import { Density, LogRow, LogTable, rowKey } from "@/components/organisms/LogTable";
import { ShareSnapshotDialog } from "@/components/organisms/ShareSnapshotDialog";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { useI18n } from "@/common/i18n/I18nProvider";
import { resolveRange } from "@/common/time/range";
import { useLogs } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { ADVANCED_FIELDS, useLogFilters } from "@/hooks/useLogFilters";
import { usePreference } from "@/hooks/usePreference";

/**
 * Registros: solo la tabla, con todos los filtros y la busqueda por campo. El
 * detalle se abre en un dialogo casi a pantalla completa, para leer mensajes,
 * stacks y metadata largos sin recortes, y se recorre con las flechas.
 */
function RecordsView() {
  const { t, fmt } = useI18n();
  const queryClient = useQueryClient();
  const { filters, setFilters, activeCount, advancedCount } = useLogFilters();
  const searchRef = useRef<HTMLInputElement>(null);

  const [now, setNow] = useState(() => Date.now());
  const rangeKey = JSON.stringify(filters.range);
  const lastRangeKey = useRef(rangeKey);
  useEffect(() => {
    if (lastRangeKey.current === rangeKey) return;
    lastRangeKey.current = rangeKey;
    setNow(Date.now());
  }, [rangeKey]);
  const resolved = resolveRange(filters.range, now);

  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const debouncedSearch = useDebounce(search);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
    // Solo reacciona a lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const [density, setDensity] = usePreference<Density>("density", "comfortable");
  const [advancedOpen, setAdvancedOpen] = usePreference<boolean>("records-advanced", true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const logs = useLogs({
    page: filters.page,
    pageSize: filters.pageSize,
    level: filters.level,
    environment: filters.environment,
    application: filters.application,
    search: filters.search,
    fingerprint: filters.fingerprint || undefined,
    ...Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, filters[key] || undefined])),
    from: resolved.from?.toISOString(),
    to: resolved.to?.toISOString(),
    sort: `${filters.sortField}:${filters.sortDir}`,
  });

  const rows: LogRow[] = logs.data?.data ?? [];
  const selectedIndex = selectedKey ? rows.findIndex((row) => rowKey(row) === selectedKey) : -1;
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : null;
  // El contexto del dialogo puede llevar a un log de fuera de la pagina.
  const [outside, setOutside] = useState<LogRow | null>(null);
  const shown = outside ?? selected;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const select = useCallback((row: LogRow) => {
    setOutside(null);
    setSelectedKey(rowKey(row));
  }, []);

  const close = useCallback(() => {
    setOutside(null);
    setSelectedKey(null);
  }, []);

  const move = (delta: number) => {
    const next = rows[selectedIndex + delta];
    if (next) select(next);
  };

  const refresh = () => {
    setNow(Date.now());
    void queryClient.invalidateQueries({ queryKey: ["logs"] });
  };

  return (
    <DashboardLayout
      title={t.records.title}
      eyebrow={t.records.eyebrow}
      description={t.records.description}
      actions={
        <>
          <IconButton icon="refresh" label={t.common.refresh} variant="secondary" onClick={refresh} />
          <Button variant="secondary" icon="share" title={t.snapshots.shareHint} onClick={() => setSharing(true)}>
            {t.snapshots.share}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <LogFilterBar
          ref={searchRef}
          filters={filters}
          setFilters={setFilters}
          search={search}
          onSearchChange={setSearch}
          onReset={() => {
            setSearch("");
            setFilters({ level: "", environment: "", application: "", search: "", fingerprint: "" });
          }}
          activeCount={activeCount}
        />

        <Card
          title={t.records.advanced}
          actions={
            <Button
              size="sm"
              variant="ghost"
              iconRight={advancedOpen ? "chevronUp" : "chevronDown"}
              aria-expanded={advancedOpen}
              aria-label={t.records.advanced}
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              {advancedCount > 0 && (
                <span className="rounded-full bg-brand-soft px-1.5 font-mono text-[0.6875rem] text-brand-ink">{advancedCount}</span>
              )}
            </Button>
          }
          divider={advancedOpen}
          className={advancedOpen ? "" : "pb-2"}
        >
          {advancedOpen ? <AdvancedLogSearch filters={filters} setFilters={setFilters} /> : undefined}
        </Card>

        <LogTable
          rows={rows}
          loading={logs.isLoading}
          fetching={logs.isFetching}
          error={logs.isError ? logs.error : null}
          total={logs.data?.total ?? 0}
          page={filters.page}
          totalPages={logs.data?.totalPages ?? 1}
          pageSize={filters.pageSize}
          onPage={(page) => setFilters({ page })}
          onPageSize={(pageSize) => setFilters({ pageSize })}
          selectedKey={shown ? rowKey(shown) : null}
          onSelect={select}
          density={density}
          onDensity={setDensity}
          live={false}
          sortField={filters.sortField}
          sortDir={filters.sortDir}
          onSort={setFilters}
        />
        {logs.data && (
          <p className="sr-only" aria-live="polite">
            {t.logs.results(fmt.number(logs.data.total))}
          </p>
        )}
      </div>

      <ShareSnapshotDialog open={sharing} onClose={() => setSharing(false)} filters={filters} advanced total={logs.data?.total ?? null} />

      {shown && (
        <LogInspector
          key="records-inspector"
          log={shown}
          onClose={close}
          onSelect={(entry) => {
            const inPage = rows.find((row) => rowKey(row) === rowKey(entry));
            if (inPage) select(inPage);
            else setOutside(entry);
          }}
          onFilterFingerprint={(fingerprint) => {
            close();
            setFilters({ fingerprint });
          }}
          onPrev={!outside && selectedIndex > 0 ? () => move(-1) : undefined}
          onNext={!outside && selectedIndex >= 0 && selectedIndex < rows.length - 1 ? () => move(1) : undefined}
          position={!outside && selectedIndex >= 0 ? { index: selectedIndex + 1, total: rows.length } : undefined}
        />
      )}
    </DashboardLayout>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={null}>
      <RecordsView />
    </Suspense>
  );
}
