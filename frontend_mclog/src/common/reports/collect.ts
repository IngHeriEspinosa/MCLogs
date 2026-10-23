import client from "@/common/api/client";
import { closedWindow } from "@/common/time/range";
import { fillTimeline, type TimelineBin } from "@/common/time/timeline";
import type { LogEntry, LogStats } from "@/hooks/useAuth";
import type { ApplicationSummary, ErrorGroup, ErrorLifecycle } from "@/hooks/useErrors";
import type { LatencyRow, ReleaseRow } from "@/hooks/useMonitoring";
import { pickFilters, type ReportOptions, type ReportSection } from "./options";

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
  /** Desde cuando cuenta el inventario sus registros. */
  applicationsSince: string | null;
  /**
   * Errores de la ventana por aplicacion, contados por el inventario: incluye
   * los que no tienen huella. Null si no se pidio el inventario; entonces se
   * suman los fallos agrupados, que se quedan cortos.
   */
  errorsByApp?: Record<string, number> | null;
  /** Nuevos, regresiones, resueltos y MTTR de la ventana; null si no se pidio. */
  lifecycle?: ErrorLifecycle | null;
  /** Fallos que volvieron tras resolverse dentro de la ventana. */
  regressed?: ErrorGroup[];
  latency?: LatencyRow[];
  releases?: ReleaseRow[];
  warnGroups: ErrorGroup[];
  previous: PreviousWindow | null;
};

const GROUPS_LIMIT = 100;
export const RECENT_ERRORS = 15;
/** Tope de ejemplos con stack: cada fallo cuesta una peticion. */
export const MAX_SAMPLES = 20;
/** Peticiones de ejemplos en vuelo a la vez, para no rafaguear el rate limit. */
const SAMPLE_CONCURRENCY = 5;

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

/** Totales por nivel de una respuesta de /api/logs/stats, que siguen la ventana pedida. */
export const totalsOf = (stats: LogStats): LevelTotals => {
  const byLevel = (level: string) => stats.byLevel.find((row) => row.level === level)?.count ?? 0;
  return { total: stats.total, error: byLevel("error"), warn: byLevel("warn"), info: byLevel("info"), debug: byLevel("debug") };
};

/**
 * Reune en paralelo todo lo que necesita un reporte. Solo pide lo que usan las
 * secciones elegidas, y los ejemplos con stack van despues porque dependen de
 * que grupos salgan.
 */
export const collectReportData = async (options: ReportOptions, now = Date.now()): Promise<ReportData> => {
  const { from, to } = closedWindow(options.range, now);
  const span = { from: from.toISOString(), to: to.toISOString() };
  // El mismo corte en todas las consultas, inventario incluido: asi las cifras
  // de las secciones cuadran entre si.
  const scope = { application: options.application, environment: options.environment, ...pickFilters(options) };
  const wants = (section: ReportSection) => options.sections.includes(section);
  // Los formatos para agentes llevan siempre el resumen numerico, que cuenta
  // los fallos distintos: sin los grupos diria "0" en vez de "no se consulto".
  const needsGroups =
    options.kind !== "markdown" || (["summary", "comparison", "applications", "errorGroups"] as const).some(wants);

  const previousSpan = { from: new Date(from.getTime() - (to.getTime() - from.getTime())).toISOString(), to: span.from };
  // Uno de mas para saber si hay mas de GROUPS_LIMIT: con exactamente 100 se
  // daba la ventana por recortada.
  const errorGroups = (window: { from: string; to: string }) =>
    client
      .get<{ data: ErrorGroup[] }>("/api/logs/errors/groups", {
        params: clean({ ...window, ...scope, level: "error", limit: GROUPS_LIMIT + 1 }),
      })
      .then((response) => ({
        groups: response.data.data.slice(0, GROUPS_LIMIT),
        capped: response.data.data.length > GROUPS_LIMIT,
        lifecycle: (response.data as { lifecycle?: ErrorLifecycle }).lifecycle ?? null,
      }));
  const stats = (window: { from: string; to: string }) =>
    client.get<LogStats>("/api/logs/stats", { params: clean({ ...window, ...scope }) }).then((response) => response.data);

  const [current, found, recentErrors, inventory, warnGroups, previousStats, previousGroups] = await Promise.all([
    stats(span),
    needsGroups || wants("lifecycle") ? errorGroups(span) : Promise.resolve({ groups: [] as ErrorGroup[], capped: false, lifecycle: null }),
    wants("recentErrors")
      ? client
          .get<{ data: LogEntry[] }>("/api/logs", {
            params: clean({ ...span, ...scope, level: "error", pageSize: RECENT_ERRORS, sort: "timestamp:desc" }),
          })
          .then((response) => response.data.data)
      : Promise.resolve([] as LogEntry[]),
    // La misma ventana que el resto del reporte. Tambien lo pide el resumen,
    // que cita las aplicaciones con mas errores.
    wants("applications") || wants("summary")
      ? client
          .get<{ data: ApplicationSummary[]; from: string }>("/api/logs/applications", {
            params: clean({ ...span, ...scope }),
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

  const { groups, capped: groupsCapped } = found;
  // Latencia y releases van aparte: solo si se piden, y vacias no salen en el reporte.
  const [latency, releases] = await Promise.all([
    wants("latency")
      ? client.get<{ data: LatencyRow[] }>("/api/logs/latency", { params: clean({ ...span, ...scope }) }).then((response) => response.data.data)
      : Promise.resolve([] as LatencyRow[]),
    wants("releases")
      ? client.get<{ data: ReleaseRow[] }>("/api/logs/releases", { params: clean({ ...span, ...scope }) }).then((response) => response.data.data)
      : Promise.resolve([] as ReleaseRow[]),
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

  const hours = fillTimeline(current.timeline ?? [], current.from, current.to, (current.bucketSeconds ?? 3600) * 1000);
  // Los totales salen de la API, que los cuenta en la ventana: sumar la serie
  // los dejaba cortos si la serie no cubria todo el rango.
  const previous: PreviousWindow | null =
    previousStats && previousGroups
      ? {
          from: previousStats.from,
          to: previousStats.to,
          totals: totalsOf(previousStats),
          groups: previousGroups.groups,
          groupsCapped: previousGroups.capped,
        }
      : null;

  return {
    generatedAt: new Date(now).toISOString(),
    from: current.from,
    to: current.to,
    origin: globalThis.location?.origin ?? "",
    hours,
    totals: totalsOf(current),
    groups,
    groupsCapped,
    samples,
    recentErrors,
    applications: inventory?.data ?? [],
    applicationsSince: inventory?.from ?? null,
    errorsByApp: inventory
      ? Object.fromEntries(inventory.data.map((app) => [app.application, app.errors ?? 0]))
      : null,
    lifecycle: wants("lifecycle") ? found.lifecycle : null,
    regressed: groups.filter((group) => group.lastRegressedAt && Date.parse(group.lastRegressedAt) >= from.getTime()),
    latency,
    releases,
    warnGroups,
    previous,
  };
};
