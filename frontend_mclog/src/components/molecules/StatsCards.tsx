import React from "react";
import { Skeleton } from "@/components/atoms/Skeleton";
import { LevelTimeline } from "@/components/molecules/LevelTimeline";
import type { LogStats } from "@/hooks/useAuth";

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

export const StatsCards: React.FC<{ stats?: LogStats; loading?: boolean }> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const errors = stats.byLevel.find((l) => l.level === "error")?.count ?? 0;
  const warns = stats.byLevel.find((l) => l.level === "warn")?.count ?? 0;
  const topApp = stats.byApplication[0];

  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total de logs" value={stats.total.toLocaleString()} />
        <StatCard label="Últimas 24 h" value={stats.last24h.toLocaleString()} />
        <StatCard label="Errores / Warnings" value={`${errors.toLocaleString()} / ${warns.toLocaleString()}`} />
        <StatCard
          label="App más activa"
          value={topApp ? topApp.application : "—"}
          hint={topApp ? `${topApp.count.toLocaleString()} logs` : undefined}
        />
      </div>

      {stats.timeline && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <LevelTimeline timeline={stats.timeline} from={stats.from} to={stats.to} />
        </div>
      )}
    </div>
  );
};
