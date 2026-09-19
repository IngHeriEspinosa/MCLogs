"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Alert } from "@/components/atoms/Alert";
import { LevelBadge } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { errorMessage } from "@/common/api/errorMessage";
import { useTrace } from "@/hooks/useErrors";
import type { LogEntry } from "@/hooks/useAuth";

/** Milisegundos transcurridos desde el primer log de la traza. */
const offsetMs = (log: LogEntry, origin: number) => new Date(log.timestamp).getTime() - origin;

const formatOffset = (ms: number) => (ms < 1000 ? `+${ms} ms` : `+${(ms / 1000).toFixed(2)} s`);

const TraceRow: React.FC<{ log: LogEntry; origin: number }> = ({ log, origin }) => {
  const [open, setOpen] = useState(false);

  return (
    <li className="relative border-l-2 border-slate-200 pl-5">
      {/* Punto de la linea temporal. */}
      <span className="absolute -left-[5px] top-3 h-2 w-2 rounded-full bg-slate-300" aria-hidden />

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-slate-400">{formatOffset(offsetMs(log, origin))}</span>
          <LevelBadge level={log.level} />
          <span className="text-sm font-medium text-slate-800">{log.application}</span>
          {log.service && log.service !== log.application && (
            <span className="text-xs text-slate-500">{log.service}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-700">{log.message}</p>
      </button>

      {open && (
        <div className="mb-2 ml-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            <span className="font-semibold">Fecha:</span> {new Date(log.timestamp).toLocaleString()}
          </p>
          <p>
            <span className="font-semibold">Host:</span> {log.host ?? "—"}
          </p>
          {log.errorName && (
            <p>
              <span className="font-semibold">Error:</span> {log.errorName}
              {log.errorCode ? ` (${log.errorCode})` : ""}
            </p>
          )}
          {log.errorStack && (
            <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {log.errorStack}
            </pre>
          )}
          {log.metadata && (
            <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
};

export default function TracePage() {
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId ?? "");
  const trace = useTrace(traceId);

  const logs = trace.data?.data ?? [];
  const origin = logs.length > 0 ? new Date(logs[0].timestamp).getTime() : 0;
  const duration = logs.length > 1 ? offsetMs(logs[logs.length - 1], origin) : 0;
  const applications = [...new Set(logs.map((log) => log.application))];

  return (
    <DashboardLayout title="Traza">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-slate-800">{traceId}</p>
          {logs.length > 0 && (
            <p className="text-xs text-slate-500">
              {logs.length} registro{logs.length === 1 ? "" : "s"} · {applications.length} aplicación
              {applications.length === 1 ? "" : "es"}
              {logs.length > 1 && ` · ${formatOffset(duration).replace("+", "")} de duración`}
            </p>
          )}
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Volver a los logs
        </Link>
      </div>

      {trace.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )}

      {trace.isError && (
        <Alert variant="error">{errorMessage(trace.error, "No encontramos ningún log con esa traza")}</Alert>
      )}

      {logs.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Los registros van en orden cronológico y el desplazamiento es relativo al primero, para ver de un vistazo
            dónde se fue el tiempo. Pulsa una línea para desplegar su detalle.
          </p>
          <ol className="flex flex-col gap-1">
            {logs.map((log) => (
              <TraceRow key={log.id} log={log} origin={origin} />
            ))}
          </ol>
        </>
      )}
    </DashboardLayout>
  );
}
