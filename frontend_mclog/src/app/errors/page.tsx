"use client";
import React, { Suspense, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Alert } from "@/components/atoms/Alert";
import { LevelBadge } from "@/components/atoms/LevelBadge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { errorMessage } from "@/common/api/errorMessage";
import { ErrorGroup, WINDOWS, useErrorGroups } from "@/hooks/useErrors";

const selectClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

/** Fecha relativa corta: "hace 4 min" dice mas que una marca absoluta al triar. */
const relative = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "hace segundos";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
};

const GroupRow: React.FC<{ group: ErrorGroup }> = ({ group }) => (
  <tr className="border-b border-slate-100 align-top hover:bg-slate-50">
    <td className="py-3 pr-4">
      <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
        {group.count.toLocaleString()}
      </span>
    </td>
    <td className="py-3 pr-4">
      <p className="font-medium text-slate-900">
        {group.errorName ?? "Sin clase de error"}
        {group.errorCode && <span className="ml-2 font-mono text-xs text-slate-500">{group.errorCode}</span>}
      </p>
      <p className="mt-0.5 line-clamp-2 max-w-xl text-sm text-slate-600" title={group.sampleMessage}>
        {group.sampleMessage}
      </p>
    </td>
    <td className="py-3 pr-4 text-sm text-slate-600">
      {group.application}
      {group.service && group.service !== group.application && (
        <span className="block text-xs text-slate-400">{group.service}</span>
      )}
    </td>
    <td className="py-3 pr-4">
      <LevelBadge level={group.level} />
    </td>
    <td className="py-3 pr-4 text-xs text-slate-500">
      <span title={new Date(group.lastSeen).toLocaleString()}>{relative(group.lastSeen)}</span>
      <span className="block text-slate-400" title={new Date(group.firstSeen).toLocaleString()}>
        primera: {relative(group.firstSeen)}
      </span>
    </td>
    <td className="py-3 text-right">
      <Link
        href={`/?fingerprint=${encodeURIComponent(group.fingerprint)}`}
        className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
      >
        Ver ocurrencias
      </Link>
    </td>
  </tr>
);

function ErrorsView() {
  const [hours, setHours] = useState<number>(24);
  const [application, setApplication] = useState("");
  const [environment, setEnvironment] = useState("");
  const [level, setLevel] = useState("error");

  const groups = useErrorGroups({
    hours,
    application: application || undefined,
    environment: environment || undefined,
    level,
  });

  const data = groups.data?.data ?? [];

  return (
    <DashboardLayout title="Errores agrupados">
      <p className="mb-4 text-sm text-slate-600">
        Cada fila es un fallo distinto, no una ocurrencia. Las repeticiones del mismo error se agrupan aunque sus
        mensajes lleven identificadores o fechas diferentes, así que el número de la izquierda dice cuántas veces ha
        pasado.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className={selectClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {WINDOWS.map((window) => (
            <option key={window.hours} value={window.hours}>
              Últimas {window.label}
            </option>
          ))}
        </select>
        <select className={selectClass} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="error">Solo errores</option>
          <option value="warn">Solo warnings</option>
        </select>
        <select className={selectClass} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option value="">Entorno (todos)</option>
          <option value="development">development</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </select>
        <input
          className="w-52 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Aplicación"
          value={application}
          onChange={(e) => setApplication(e.target.value)}
        />
      </div>

      {groups.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}

      {groups.isError && <Alert variant="error">{errorMessage(groups.error, "No pudimos cargar los errores")}</Alert>}

      {groups.data && !groups.isLoading && (
        <div className={`overflow-x-auto transition-opacity ${groups.isFetching ? "opacity-60" : ""}`}>
          {data.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Ningún error en esta ventana. Amplía el rango o cambia los filtros.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Veces</th>
                  <th className="py-2 pr-4">Error</th>
                  <th className="py-2 pr-4">Aplicación</th>
                  <th className="py-2 pr-4">Nivel</th>
                  <th className="py-2 pr-4">Actividad</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.map((group) => (
                  <GroupRow key={group.fingerprint} group={group} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
