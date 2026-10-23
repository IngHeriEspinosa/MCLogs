"use client";
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ButtonLink, IconButton } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { Menu } from "@/components/molecules/Menu";
import { useToast } from "@/components/molecules/Toast";
import { LogFilterBar } from "@/components/organisms/LogFilterBar";
import { LogInspector } from "@/components/organisms/LogInspector";
import { LogOverview } from "@/components/organisms/LogOverview";
import { Density, LogRow, LogTable, rowKey } from "@/components/organisms/LogTable";
import { ShareSnapshotDialog } from "@/components/organisms/ShareSnapshotDialog";
import { SavedViewsMenu } from "@/components/organisms/SavedViewsMenu";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { downloadLogs } from "@/common/api/download";
import { useI18n } from "@/common/i18n/I18nProvider";
import { isRelative, queryWindow, rangeToParams, resolveRange } from "@/common/time/range";
import { useLogs } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { ADVANCED_FIELDS, useLogFilters } from "@/hooks/useLogFilters";
import { useLogStream } from "@/hooks/useLogStream";
import { useNow } from "@/hooks/useNow";
import { useLogById } from "@/hooks/useErrors";
import { usePreference } from "@/hooks/usePreference";

/** Boton "En vivo" con su indicador de estado de la conexion. */
const LiveToggle: React.FC<{
  on: boolean;
  allowed: boolean;
  status: string;
  onToggle: () => void;
}> = ({ on, allowed, status, onToggle }) => {
  const { t } = useI18n();
  const label = !on
    ? t.logs.live
    : status === "error"
      ? t.logs.liveReconnecting
      : status === "connecting"
        ? t.logs.liveConnecting
        : t.logs.live;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!allowed}
      aria-pressed={on}
      title={allowed ? t.logs.liveHint : t.logs.liveUnavailable}
      className={`inline-flex h-9 items-center gap-2.5 rounded-lg border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        on
          ? "border-success/40 bg-success-soft text-success"
          : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"
      }`}
    >
      <span aria-hidden className="relative flex h-2.5 w-2.5">
        {on && status === "live" && <span className="absolute inset-0 animate-live-ring rounded-full bg-[#0ca30c]" />}
        <span
          className={`relative h-2.5 w-2.5 rounded-full ${
            !on ? "bg-line-strong" : status === "live" ? "bg-[#0ca30c]" : status === "error" ? "bg-lvl-error" : "bg-lvl-warn"
          }`}
        />
      </span>
      {label}
    </button>
  );
};

function LogsView() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const notify = useToast();
  const queryClient = useQueryClient();
  const { filters, setFilters, activeCount, advancedCount } = useLogFilters();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  // Instante de referencia de los rangos relativos. Avanza cada minuto en la
  // primera pagina, para que tabla y resumen sigan al reloj; en las demas se
  // queda quieto, para que las filas no se muevan mientras se pagina.
  const relative = isRelative(filters.range);
  const [now, setNow] = useNow(60_000, relative && filters.page === 1, JSON.stringify(filters.range));
  const resolved = resolveRange(filters.range, now);
  const span = queryWindow(filters.range, now);

  // La busqueda se escribe en local y llega a la URL con retardo.
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const debouncedSearch = useDebounce(search);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
    // Solo reacciona a lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const [density, setDensity] = usePreference<Density>("density", "comfortable");
  const [showOverview, setShowOverview] = usePreference<boolean>("overview", true);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [live, setLive] = useState(false);
  const [sharing, setSharing] = useState(false);

  const queryFilters = {
    level: filters.level,
    environment: filters.environment,
    application: filters.application,
    search: filters.search,
    fingerprint: filters.fingerprint || undefined,
    // Los campos de la busqueda avanzada, si llegan en la URL (desde Registros
    // o desde el enlace de una alerta): antes se ignoraban aqui y la tabla
    // enseñaba mas de lo que decia el enlace.
    ...Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, filters[key] || undefined])),
    from: span.from?.toISOString(),
    to: span.to?.toISOString(),
    sort: `${filters.sortField}:${filters.sortDir}`,
  };
  const logs = useLogs({ page: filters.page, pageSize: filters.pageSize, ...queryFilters });

  /**
   * El modo en vivo antepone los logs que llegan al principio de la tabla, asi
   * que solo tiene sentido en la primera pagina, con el orden por defecto y un
   * rango abierto hasta ahora. En cualquier otra vista se desactiva solo. El
   * stream filtra por nivel, entorno, aplicacion, busqueda y huella; con un
   * filtro de la busqueda avanzada activo anteponeria filas que no lo cumplen.
   */
  const liveAllowed =
    filters.page === 1 &&
    filters.sortField === "timestamp" &&
    filters.sortDir === "desc" &&
    !resolved.to &&
    ADVANCED_FIELDS.every((key) => !filters[key]);
  const liveOn = live && liveAllowed;
  const stream = useLogStream(
    liveOn,
    {
      level: filters.level,
      environment: filters.environment,
      application: filters.application,
      search: filters.search,
      fingerprint: filters.fingerprint,
    },
    filters.pageSize,
  );

  // En vivo se refresca la tabla cada 15 s y se vacia el buffer: las filas
  // recien llegadas se sustituyen por las del servidor, con id y metadata.
  // Depende de `clear` y no del objeto `stream`, que cambia en cada render: con
  // logs llegando a menudo el temporizador se reiniciaba antes de cumplirse y
  // la tabla no se refrescaba nunca.
  const clearStream = stream.clear;
  useEffect(() => {
    if (!liveOn) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["logs"] });
      clearStream();
    }, 15_000);
    return () => clearInterval(timer);
  }, [liveOn, queryClient, clearStream, setNow]);

  const rows: LogRow[] = liveOn ? [...stream.logs, ...(logs.data?.data ?? [])].slice(0, filters.pageSize) : logs.data?.data ?? [];
  // El detalle se recorre con las flechas mientras el log siga en la pagina; el
  // contexto del dialogo puede llevar a uno de fuera, y ahi no hay vecinos.
  const selectedIndex = selected ? rows.findIndex((row) => rowKey(row) === rowKey(selected)) : -1;
  const move = (delta: number) => {
    const next = rows[selectedIndex + delta];
    if (next) setSelected(next);
  };

  // "/" enfoca la busqueda, como en tantas consolas.
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

  // Enlace directo a un log (`?log=123`, p. ej. desde el historial de alertas o
  // "Copiar enlace" del detalle): se abre su detalle en cuanto llega.
  const pathname = usePathname();
  const linkedId = Number(searchParams.get("log")) || null;
  const linked = useLogById(linkedId);
  useEffect(() => {
    if (linked.data) setSelected(linked.data);
  }, [linked.data]);

  const closeInspector = useCallback(() => {
    setSelected(null);
    // Al cerrar se quita el enlace, para que refrescar no lo vuelva a abrir.
    if (searchParams.get("log")) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("log");
      router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const refresh = () => {
    setNow(Date.now());
    void queryClient.invalidateQueries({ queryKey: ["logs"] });
    void queryClient.invalidateQueries({ queryKey: ["error-groups"] });
  };

  const exportData = async (format: "csv" | "ndjson") => {
    try {
      const name = await downloadLogs(format, queryFilters);
      notify(t.toast.downloaded(name));
    } catch {
      notify(t.toast.exportFailed, "error");
    }
  };

  const openReport = (kind: "markdown" | "agent-md") => {
    const params = new URLSearchParams({ kind, generate: "1" });
    Object.entries(rangeToParams(filters.range)).forEach(([key, value]) => value && params.set(key, value));
    if (filters.application) params.set("application", filters.application);
    if (filters.environment) params.set("environment", filters.environment);
    // El reporte acota lo mismo que se esta viendo. El nivel no viaja: en el
    // reporte lo deciden las secciones.
    if (filters.search) params.set("search", filters.search);
    if (filters.fingerprint) params.set("fingerprint", filters.fingerprint);
    router.push(`/reports?${params.toString()}`);
  };

  const rangeQuery = new URLSearchParams(
    Object.entries(rangeToParams(filters.range)).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  const filterFingerprint = (fingerprint: string) => {
    setFilters({ fingerprint });
    setSelected(null);
  };

  return (
    <DashboardLayout
      title={t.logs.title}
      eyebrow={t.logs.eyebrow}
      description={t.logs.description}
      presentable
      actions={
        <>
          <SavedViewsMenu path="/logs" />
          <IconButton
            icon="panelTop"
            label={showOverview ? t.logs.hideOverview : t.logs.showOverview}
            variant="secondary"
            active={!showOverview}
            onClick={() => setShowOverview(!showOverview)}
          />
          <IconButton icon="refresh" label={t.common.refresh} variant="secondary" onClick={refresh} />
          <Button variant="secondary" icon="share" title={t.snapshots.shareHint} onClick={() => setSharing(true)}>
            {t.snapshots.share}
          </Button>
          <LiveToggle on={liveOn} allowed={liveAllowed} status={stream.status} onToggle={() => setLive((value) => !value)} />
          <Menu
            label={t.logs.export}
            icon="download"
            variant="primary"
            items={[
              { type: "label", key: "data", label: t.logs.exportData },
              { key: "csv", label: t.logs.exportCsv, hint: t.logs.exportCsvHint, icon: "table", onSelect: () => void exportData("csv") },
              { key: "ndjson", label: t.logs.exportNdjson, hint: t.logs.exportNdjsonHint, icon: "braces", onSelect: () => void exportData("ndjson") },
              { type: "separator", key: "separator" },
              { type: "label", key: "reports", label: t.logs.exportReports },
              { key: "md", label: t.logs.exportMd, hint: t.logs.exportMdHint, icon: "report", onSelect: () => openReport("markdown") },
              { key: "ai", label: t.logs.exportAi, hint: t.logs.exportAiHint, icon: "sparkles", onSelect: () => openReport("agent-md") },
            ]}
          />
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
            setFilters({
              level: "",
              environment: "",
              application: "",
              search: "",
              fingerprint: "",
              ...Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, ""])),
            });
          }}
          activeCount={activeCount + advancedCount}
        />

        {filters.fingerprint && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand/25 bg-brand-soft/60 px-4 py-2.5 text-sm text-ink">
            <Icon name="hash" className="h-4 w-4 text-brand" />
            <span>{t.logs.fingerprintBanner}</span>
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-2">{filters.fingerprint.slice(0, 16)}…</code>
            <div className="ml-auto flex items-center gap-2">
              <Button size="xs" variant="secondary" icon="x" onClick={() => setFilters({ fingerprint: "" })}>
                {t.logs.removeFilter}
              </Button>
              {/* Con el mismo rango: volver a Errores con otro contaria otros grupos. */}
              <Link href={rangeQuery ? `/errors?${rangeQuery}` : "/errors"} className="text-xs font-medium">
                {t.logs.backToGroups}
              </Link>
            </div>
          </div>
        )}

        {showOverview && (
          <LogOverview
            range={filters.range}
            now={now}
            application={filters.application}
            environment={filters.environment}
            onSelectRange={(from, to) => setFilters({ range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() } })}
            onSelectLevel={(level) => setFilters({ level })}
            onSelectApplication={(application) => setFilters({ application })}
            onSelectEnvironment={(environment) => setFilters({ environment })}
            onSelectFingerprint={filterFingerprint}
          />
        )}

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
          selectedKey={selected ? rowKey(selected) : null}
          onSelect={setSelected}
          density={density}
          onDensity={setDensity}
          live={liveOn}
          sortField={filters.sortField}
          sortDir={filters.sortDir}
          onSort={setFilters}
          titleAction={
            // Los mismos filtros viajan a Registros: se abre la misma vista, con mas espacio.
            <ButtonLink
              href={searchParams.toString() ? `/records?${searchParams.toString()}` : "/records"}
              aria-label={t.logs.openRecords}
              title={t.logs.openRecords}
              variant="ghost"
              size="xs"
              icon="externalLink"
              className="w-7 px-0"
            />
          }
          onWidenRange={
            isRelative(filters.range) && filters.range.preset !== "7d" && filters.range.preset !== "30d" && filters.range.preset !== "all"
              ? () => setFilters({ range: { preset: "7d" } })
              : undefined
          }
        />
        {selected && (
          <LogInspector
            log={selected}
            onClose={closeInspector}
            onSelect={setSelected}
            onFilterFingerprint={filterFingerprint}
            onPrev={selectedIndex > 0 ? () => move(-1) : undefined}
            onNext={selectedIndex >= 0 && selectedIndex < rows.length - 1 ? () => move(1) : undefined}
            position={selectedIndex >= 0 ? { index: selectedIndex + 1, total: rows.length } : undefined}
          />
        )}
        <ShareSnapshotDialog open={sharing} onClose={() => setSharing(false)} source={{ kind: "logs", filters }} total={logs.data?.total ?? null} />
        {logs.data && (
          <p className="sr-only" aria-live="polite">
            {t.logs.results(fmt.number(logs.data.total))}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <LogsView />
    </Suspense>
  );
}
