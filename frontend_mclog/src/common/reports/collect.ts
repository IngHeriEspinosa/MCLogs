import client from "@/common/api/client";
import { closedWindow } from "@/common/time/range";
import { fillTimeline, HOUR_MS, sumLevels, type TimelineBin } from "@/common/time/timeline";
import type { LogEntry, LogStats } from "@/hooks/useAuth";
import type { ApplicationSummary, ErrorGroup } from "@/hooks/useErrors";
import type { ReportOptions, ReportSection } from "./options";

export * from "./options";

export type LevelTotals = { total: number; error: number; warn: number; info: number; debug: number };

/** La ventana de igual duracion justo antes de la del reporte. */
export type PreviousWindow = {
  from: string;
  to: string;
  totals: LevelTotals;
  groups: ErrorGroup[];
  groupsCapped: boolean;
};

export type ReportData = {
  generatedAt: string;
  from: string;
  to: string;
  origin: string;
  hours: TimelineBin[];
  totals: LevelTotals;
  /** Todos los grupos devueltos (hasta 100): sirven para contar fallos distintos. */
  groups: ErrorGroup[];
  groupsCapped: boolean;
  /** Ejemplo mas reciente de cada fallo incluido, por huella, para su stack. */
  samples: Record<string, LogEntry>;
  recentErrors: LogEntry[];
  applications: ApplicationSummary[];
  /** Desde cuando cuenta el inventario sus registros (hasta ahora, no hasta `to`). */
  applicationsSince: string | null;
  warnGroups: ErrorGroup[];
  previous: PreviousWindow | null;
};

const GROUPS_LIMIT = 100;
export const RECENT_ERRORS = 15;
/** Tope de ejemplos con stack: cada fallo cuesta una peticion. */
export const MAX_SAMPLES = 20;
/** Peticiones de ejemplos en vuelo a la vez, para no rafaguear el rate limit. */
const SAMPLE_CONCURRENCY = 5;
/** Limites que acepta /api/logs/applications para `hours`. */
const INVENTORY_HOURS = { min: 24, max: 24 * 31 };

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ""));

/** Como Promise.all, pero con como mucho `limit` promesas pendientes. */
export const mapLimit = async <T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * El inventario solo admite una ventana relativa hasta ahora. Se le pide la que
 * cubre desde el inicio del reporte, dentro de los limites del backend.
 */
export const inventoryHours = (from: Date, now: number) =>
  Math.min(INVENTORY_HOURS.max, Math.max(INVENTORY_HOURS.min, Math.ceil((now - from.getTime()) / HOUR_MS)));

/**
 * Reune en paralelo todo lo que necesita un reporte. Solo pide lo que usan las
 * secciones elegidas, y los ejemplos con stack van despues porque dependen de
 * que grupos salgan.
 */
export const collectReportData = async (options: ReportOptions, now = Date.now()): Promise<ReportData> => {
  const { from, to } = closedWindow(options.range, now);
  const span = { from: from.toISOString(), to: to.toISOString() };
  const scope = { application: options.application, environment: options.environment };
  const wants = (section: ReportSection) => options.sections.includes(section);
  // Los formatos para agentes llevan siempre el resumen numerico, que cuenta
  // los fallos distintos: sin los grupos diria "0" en vez de "no se consulto".
  const needsGroups =
    options.kind !== "markdown" || (["summary", "comparison", "applications", "errorGroups"] as const).some(wants);

  const previousSpan = { from: new Date(from.getTime() - (to.getTime() - from.getTime())).toISOString(), to: span.from };
  const errorGroups = (window: { from: string; to: string }) =>
    client
      .get<{ data: ErrorGroup[] }>("/api/logs/errors/groups", {
        params: clean({ ...window, ...scope, level: "error", limit: GROUPS_LIMIT }),
      })
      .then((response) => response.data.data);
  const stats = (window: { from: string; to: string }) =>
    client.get<LogStats>("/api/logs/stats", { params: clean({ ...window, ...scope }) }).then((response) => response.data);

  const [current, groups, recentErrors, inventory, warnGroups, previousStats, previousGroups] = await Promise.all([
    stats(span),
    needsGroups ? errorGroups(span) : Promise.resolve([] as ErrorGroup[]),
    wants("recentErrors")
      ? client
          .get<{ data: LogEntry[] }>("/api/logs", {
            params: clean({ ...span, ...scope, level: "error", pageSize: RECENT_ERRORS, sort: "timestamp:desc" }),
          })
          .then((response) => response.data.data)
      : Promise.resolve([] as LogEntry[]),
    wants("applications")
      ? client
          .get<{ data: ApplicationSummary[]; from: string }>("/api/logs/applications", {
            params: { hours: inventoryHours(from, now) },
          })
          .then((response) => response.data)
      : Promise.resolve(null),
    wants("warnGroups")
      ? client
          .get<{ data: ErrorGroup[] }>("/api/logs/errors/groups", {
            params: clean({ ...span, ...scope, level: "warn", limit: options.maxGroups }),
          })
          .then((response) => response.data.data)
      : Promise.resolve([] as ErrorGroup[]),
    wants("comparison") ? stats(previousSpan) : Promise.resolve(null),
    wants("comparison") ? errorGroups(previousSpan) : Promise.resolve(null),
  ]);

  const samples: Record<string, LogEntry> = {};
  if (options.includeStacks && wants("errorGroups")) {
    const picked = groups.slice(0, Math.min(options.maxGroups, MAX_SAMPLES));
    const fetched = await mapLimit(picked, SAMPLE_CONCURRENCY, (group) =>
      client
        .get<LogEntry>(`/api/logs/${group.lastLogId}`)
        .then((response) => response.data)
        // Un ejemplo que ya no existe (purgado) no debe tumbar el reporte.
        .catch(() => null),
    );
    picked.forEach((group, index) => {
      const sample = fetched[index];
      if (sample) samples[group.fingerprint] = sample;
    });
  }

  // El filtro de aplicacion del backend es "contiene", no igualdad: aqui igual.
  const needle = options.application?.toLowerCase();
  const applications = (inventory?.data ?? [])
    .filter((app) => !needle || app.application.toLowerCase().includes(needle))
    .filter((app) => !options.environment || app.environments.includes(options.environment));

  const hours = fillTimeline(current.timeline ?? [], current.from, current.to);
  const previous: PreviousWindow | null =
    previousStats && previousGroups
      ? {
          from: previousStats.from,
          to: previousStats.to,
          totals: sumLevels(fillTimeline(previousStats.timeline ?? [], previousStats.from, previousStats.to)),
          groups: previousGroups,
          groupsCapped: previousGroups.length >= GROUPS_LIMIT,
        }
      : null;

  return {
    generatedAt: new Date(now).toISOString(),
    from: current.from,
    to: current.to,
    origin: globalThis.location?.origin ?? "",
    hours,
    totals: sumLevels(hours),
    groups,
    groupsCapped: groups.length >= GROUPS_LIMIT,
    samples,
    recentErrors,
    applications,
    applicationsSince: inventory?.from ?? null,
    warnGroups,
    previous,
  };
};
