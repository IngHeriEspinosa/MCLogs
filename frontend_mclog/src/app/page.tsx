"use client";
import React, { Suspense, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { useLogs, useLogout, useLogStats, LogEntry } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { PrimaryButton } from "@/components/atoms/PrimaryButton";
import { LevelBadge } from "@/components/atoms/LevelBadge";
import { DownloadActions } from "@/components/molecules/DownloadActions";
import { StatsCards } from "@/components/molecules/StatsCards";
import { downloadLogs } from "@/common/api/download";
import { Skeleton } from "@/components/atoms/Skeleton";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SortField = "timestamp" | "application" | "level" | "host" | "environment";

const SORT_FIELDS: readonly SortField[] = ["timestamp", "application", "level", "host", "environment"];

function LogsDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sanitizeSortField = (value: string | null): SortField =>
    SORT_FIELDS.includes(value as SortField) ? (value as SortField) : "timestamp";

  const initialPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const [level, setLevel] = useState<string>(searchParams.get("level") ?? "");
  const [environment, setEnvironment] = useState<string>(searchParams.get("environment") ?? "");
  const [application, setApplication] = useState<string>(searchParams.get("application") ?? "");
  const [search, setSearch] = useState<string>(searchParams.get("search") ?? "");
  const [from, setFrom] = useState<string>(searchParams.get("from") ?? "");
  const [to, setTo] = useState<string>(searchParams.get("to") ?? "");
  const [page, setPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(parseInt(searchParams.get("pageSize") || "25", 10) || 25);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(searchParams.get("sortDir") === "asc" ? "asc" : "desc");
  const [sortField, setSortField] = useState<SortField>(sanitizeSortField(searchParams.get("sortField")));
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const debouncedSearch = useDebounce(search);
  const debouncedApplication = useDebounce(application);

  const activeFilters = {
    level,
    environment,
    application: debouncedApplication,
    search: debouncedSearch,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    sort: `${sortField}:${sortDir}`,
  };

  const { data, isLoading, isFetching, isError, error } = useLogs({
    page,
    pageSize,
    ...activeFilters,
  });
  const stats = useLogStats();
  const logout = useLogout();

  const updateUrl = useMemo(
    () =>
      (updates: Record<string, string | number | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        const nextState: Record<string, string | number | undefined> = {
          page,
          pageSize,
          level: level || undefined,
          environment: environment || undefined,
          application: application || undefined,
          search: search || undefined,
          from: from || undefined,
          to: to || undefined,
          sortField,
          sortDir,
          ...updates,
        };
        Object.entries(nextState).forEach(([key, value]) => {
          const isDefault =
            value === undefined ||
            value === "" ||
            (key === "page" && value === 1) ||
            (key === "pageSize" && value === 25) ||
            (key === "sortField" && value === "timestamp") ||
            (key === "sortDir" && value === "desc");
          if (isDefault) params.delete(key);
          else params.set(key, String(value));
        });
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      },
    [application, environment, from, level, page, pageSize, pathname, router, search, searchParams, sortDir, sortField, to]
  );

  const resetToFirstPage = (updates: Record<string, string | number | undefined>) => {
    setPage(1);
    updateUrl({ ...updates, page: 1 });
  };

  const totalPages = data?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const selectClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white";

  return (
    <DashboardLayout
      title="Logs recientes"
      actions={
        <div className="flex gap-2">
          <DownloadActions
            onCsv={() => downloadLogs("csv", activeFilters)}
            onNdjson={() => downloadLogs("ndjson", activeFilters)}
          />
          <PrimaryButton onClick={() => logout.mutateAsync()}>Cerrar sesión</PrimaryButton>
        </div>
      }
    >
      <StatsCards stats={stats.data} loading={stats.isLoading} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <select
          className={selectClass}
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            resetToFirstPage({ level: e.target.value });
          }}
        >
          <option value="">Nivel (todos)</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <select
          className={selectClass}
          value={environment}
          onChange={(e) => {
            setEnvironment(e.target.value);
            resetToFirstPage({ environment: e.target.value });
          }}
        >
          <option value="">Entorno (todos)</option>
          <option value="development">development</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </select>
        <input
          className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Aplicación"
          value={application}
          onChange={(e) => {
            setApplication(e.target.value);
            resetToFirstPage({ application: e.target.value });
          }}
        />
        <input
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Buscar mensaje, app, host o traceId"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage({ search: e.target.value });
          }}
        />
        <label className="text-xs text-slate-600">
          Desde
          <input
            type="datetime-local"
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetToFirstPage({ from: e.target.value });
            }}
          />
        </label>
        <label className="text-xs text-slate-600">
          Hasta
          <input
            type="datetime-local"
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetToFirstPage({ to: e.target.value });
            }}
          />
        </label>
        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value={sortField}
            onChange={(e) => {
              const next = sanitizeSortField(e.target.value);
              setSortField(next);
              resetToFirstPage({ sortField: next });
            }}
          >
            <option value="timestamp">fecha</option>
            <option value="application">aplicación</option>
            <option value="level">nivel</option>
            <option value="host">host</option>
            <option value="environment">entorno</option>
          </select>
          <button
            className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
            onClick={() => {
              const next = sortDir === "desc" ? "asc" : "desc";
              setSortDir(next);
              updateUrl({ sortDir: next });
            }}
            type="button"
          >
            {sortDir === "desc" ? "↓ desc" : "↑ asc"}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
            Cargando registros
          </div>
          <div className="divide-y divide-slate-100 px-4 py-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-4 py-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No pudimos cargar los logs. Detalle: {(error as Error)?.message ?? "error desconocido"}.
        </div>
      )}

      {data && !isLoading && (
        <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : "opacity-100"}`}>
          <table className="w-full text-sm text-slate-800">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">App</th>
                <th className="py-2 pr-4">Servicio</th>
                <th className="py-2 pr-4">Nivel</th>
                <th className="py-2 pr-4">Entorno</th>
                <th className="py-2 pr-4">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((log: LogEntry) => (
                <React.Fragment key={log.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-medium">{log.application}</td>
                    <td className="py-2 pr-4 text-slate-600">{log.service ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <LevelBadge level={log.level} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{log.environment}</td>
                    <td className="max-w-[420px] truncate py-2 pr-4 text-slate-700" title={log.message}>
                      {log.message}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <p><span className="font-semibold">Host:</span> {log.host ?? "—"}</p>
                          <p><span className="font-semibold">TraceId:</span> {log.traceId ?? "—"}</p>
                          <p className="sm:col-span-2"><span className="font-semibold">Mensaje completo:</span> {log.message}</p>
                        </div>
                        {log.metadata && (
                          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    No hay registros que coincidan con tu búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Página {page} de {totalPages} · {data.total} registros
            </span>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                value={pageSize}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  setPageSize(next);
                  resetToFirstPage({ pageSize: next });
                }}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} / página
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                onClick={() => {
                  if (!canPrev) return;
                  const next = Math.max(1, page - 1);
                  setPage(next);
                  updateUrl({ page: next });
                }}
                disabled={!canPrev}
              >
                Anterior
              </button>
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                onClick={() => {
                  if (!canNext) return;
                  const next = Math.min(totalPages, page + 1);
                  setPage(next);
                  updateUrl({ page: next });
                }}
                disabled={!canNext}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <LogsDashboard />
    </Suspense>
  );
}
