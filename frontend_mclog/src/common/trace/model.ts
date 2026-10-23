import type { LogEntry } from "@/hooks/useAuth";

/**
 * Lectura de una traza a partir de sus logs, sin React: carriles por servicio,
 * la ruta que siguio la operacion, la anidacion por tramos, el primer error,
 * el mayor salto y el plegado de repeticiones. La pantalla de traza, el panel
 * del inspector y los snapshots pintan lo que sale de aqui.
 */

/** Estado de la operacion: fallo si algun paso dio error; con avisos si alguno dio warning. */
export type TraceStatus = "ok" | "warn" | "failed";

/** Un servicio de la traza, con sus pasos sobre el eje comun (ms desde el primer log). */
export type TraceLane = {
  key: string;
  application: string;
  service: string | null;
  count: number;
  errors: number;
  warnings: number;
  /** Desfase del primer y del ultimo paso del carril, en ms. */
  start: number;
  end: number;
};

export type TraceModel = {
  /** Instante del primer log, en ms. */
  origin: number;
  durationMs: number;
  /** Desfase de cada log respecto al primero, en el orden de `logs`. */
  offsets: number[];
  /** Carriles en orden de primera aparicion. */
  lanes: TraceLane[];
  /** Carriles por los que paso la operacion, en orden y sin repetir consecutivos. */
  route: string[];
  hosts: string[];
  status: TraceStatus;
  /** Posicion del primer error en `logs`, o null si no hubo. */
  firstErrorIndex: number | null;
  /** Mayor tiempo entre dos pasos consecutivos: `index` es el paso que llega tarde. */
  largestGap: { index: number; ms: number } | null;
  /** Profundidad de anidacion de cada log segun su tramo (0 = raiz). */
  depth: number[];
};

/** Carril de un log: "aplicacion › servicio", o solo la aplicacion si coinciden o no hay servicio. */
export const laneKey = (log: Pick<LogEntry, "application" | "service">) =>
  log.service && log.service !== log.application ? `${log.application} › ${log.service}` : log.application;

/** Desfase de cada log respecto al primero, en ms. */
export const traceOffsets = (logs: Pick<LogEntry, "timestamp">[]) => {
  const origin = logs.length > 0 ? Date.parse(logs[0].timestamp) : 0;
  return logs.map((log) => Date.parse(log.timestamp) - origin);
};

/**
 * Profundidad de cada log por sus tramos. Un tramo cuyo padre esta en la
 * traza va un nivel por debajo de el; si el padre no llego (o no hay tramos),
 * se queda en la raiz. La guarda corta los ciclos de un emisor mal hecho.
 */
const spanDepths = (logs: Pick<LogEntry, "spanId" | "parentSpanId">[]) => {
  const parentOf = new Map<string, string>();
  for (const log of logs) {
    if (log.spanId && log.parentSpanId && log.parentSpanId !== log.spanId) parentOf.set(log.spanId, log.parentSpanId);
  }
  const known = new Set(logs.map((log) => log.spanId).filter((value): value is string => Boolean(value)));
  const depthOf = (spanId: string) => {
    let depth = 0;
    let current = parentOf.get(spanId);
    const seen = new Set([spanId]);
    while (current && known.has(current) && !seen.has(current)) {
      depth += 1;
      seen.add(current);
      current = parentOf.get(current);
    }
    return depth;
  };
  return logs.map((log) => (log.spanId ? depthOf(log.spanId) : 0));
};

export const buildTraceModel = (logs: LogEntry[]): TraceModel => {
  const offsets = traceOffsets(logs);
  const lanes = new Map<string, TraceLane>();
  const route: string[] = [];
  const hosts = new Set<string>();
  let firstErrorIndex: number | null = null;
  let largestGap: TraceModel["largestGap"] = null;

  logs.forEach((log, index) => {
    const key = laneKey(log);
    const lane = lanes.get(key) ?? {
      key,
      application: log.application,
      service: log.service ?? null,
      count: 0,
      errors: 0,
      warnings: 0,
      start: offsets[index],
      end: offsets[index],
    };
    lane.count += 1;
    if (log.level === "error") lane.errors += 1;
    if (log.level === "warn") lane.warnings += 1;
    lane.end = offsets[index];
    lanes.set(key, lane);

    if (route[route.length - 1] !== key) route.push(key);
    if (log.host) hosts.add(log.host);
    if (log.level === "error" && firstErrorIndex === null) firstErrorIndex = index;
    if (index > 0) {
      const gap = offsets[index] - offsets[index - 1];
      if (gap > 0 && (!largestGap || gap > largestGap.ms)) largestGap = { index, ms: gap };
    }
  });

  const all = [...lanes.values()];
  const status: TraceStatus = all.some((lane) => lane.errors > 0)
    ? "failed"
    : all.some((lane) => lane.warnings > 0)
      ? "warn"
      : "ok";

  return {
    origin: logs.length > 0 ? Date.parse(logs[0].timestamp) : 0,
    durationMs: offsets.length > 0 ? offsets[offsets.length - 1] : 0,
    offsets,
    lanes: all,
    route,
    hosts: [...hosts],
    status,
    firstErrorIndex,
    largestGap,
    depth: spanDepths(logs),
  };
};

/** Mensaje sin cifras: dos pasos que solo cambian en un id se pliegan juntos. */
const shape = (message: string) => message.split("\n")[0].replace(/\d+/g, "#").trim();

/** Una fila de la vista cronologica: un log, o varios iguales seguidos plegados en uno. */
export type TraceRowGroup = {
  /** Posicion del primer log del grupo en la lista original. */
  index: number;
  /** Cuantos logs iguales seguidos representa (1 = no plegado). */
  count: number;
};

/**
 * Pliega los logs consecutivos del mismo nivel, carril y mensaje (sin cifras):
 * un bucle que registra lo mismo cien veces ocupa una fila con "×100". El
 * primer error nunca se pliega, para que "Ir al primer error" lo encuentre.
 */
export const collapseRepeats = (logs: LogEntry[], firstErrorIndex: number | null = null): TraceRowGroup[] => {
  const groups: TraceRowGroup[] = [];
  logs.forEach((log, index) => {
    const last = groups[groups.length - 1];
    const previous = last ? logs[last.index] : null;
    const same =
      previous &&
      index !== firstErrorIndex &&
      last.index !== firstErrorIndex &&
      previous.level === log.level &&
      laneKey(previous) === laneKey(log) &&
      shape(previous.message) === shape(log.message);
    if (same) last.count += 1;
    else groups.push({ index, count: 1 });
  });
  return groups;
};

export type TraceFilter = {
  /** "" = todos; "warn" = warning y error; "error" = solo errores. */
  level: "" | "warn" | "error";
  /** Carril (ver `laneKey`), o "" para todos. */
  lane: string;
  /** Texto en el mensaje, sin distinguir mayusculas. */
  text: string;
};

export const NO_FILTER: TraceFilter = { level: "", lane: "", text: "" };

const LEVEL_RANK: Record<LogEntry["level"], number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Si un log pasa el filtro de la traza. */
export const matchesTraceFilter = (log: LogEntry, filter: TraceFilter) => {
  if (filter.level === "warn" && LEVEL_RANK[log.level] < LEVEL_RANK.warn) return false;
  if (filter.level === "error" && log.level !== "error") return false;
  if (filter.lane && laneKey(log) !== filter.lane) return false;
  const text = filter.text.trim().toLowerCase();
  return !text || log.message.toLowerCase().includes(text);
};
