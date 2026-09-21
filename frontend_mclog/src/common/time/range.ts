/**
 * Rangos de tiempo de la consola.
 *
 * Un rango es relativo ("ultimas 24 h", que se mueve con el reloj) o absoluto
 * (dos fechas fijas). En la URL viajan como `range=24h` o como `from`/`to` en
 * ISO, asi que un enlace compartido abre exactamente la misma vista. Los
 * enlaces antiguos, con `from`/`to` de un datetime-local, siguen funcionando.
 */

export const PRESETS = ["15m", "1h", "6h", "24h", "7d", "30d", "all"] as const;
export type Preset = (typeof PRESETS)[number];

const MINUTE = 60_000;

export const PRESET_MINUTES: Record<Exclude<Preset, "all">, number> = {
  "15m": 15,
  "1h": 60,
  "6h": 6 * 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
};

export type TimeRange = { preset: Preset } | { from: string; to?: string };

export const DEFAULT_RANGE: TimeRange = { preset: "24h" };

/** Tope del backend para la serie horaria de /api/logs/stats (31 dias). */
export const MAX_TIMELINE_HOURS = 24 * 31;

export const isPreset = (value: unknown): value is Preset => PRESETS.includes(value as Preset);

export const isRelative = (range: TimeRange): range is { preset: Preset } => "preset" in range;

/** Ventana concreta. Sin `from` no hay limite inferior; sin `to`, llega hasta ahora. */
export type ResolvedRange = { from?: Date; to?: Date };

export const resolveRange = (range: TimeRange, now: number): ResolvedRange => {
  if (isRelative(range)) {
    if (range.preset === "all") return {};
    return { from: new Date(now - PRESET_MINUTES[range.preset] * MINUTE) };
  }
  return { from: new Date(range.from), to: range.to ? new Date(range.to) : undefined };
};

/**
 * Ventana cerrada por los dos lados, para lo que necesita un final (la serie
 * del grafico, los reportes). "Todo el historico" se recorta a lo que el
 * backend acepta para la serie horaria.
 */
export const closedWindow = (range: TimeRange, now: number): { from: Date; to: Date } => {
  const resolved = resolveRange(range, now);
  const to = resolved.to ?? new Date(now);
  const from = resolved.from ?? new Date(to.getTime() - MAX_TIMELINE_HOURS * 60 * MINUTE);
  return { from, to };
};

const parseDate = (value: string | null) => {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

export const rangeFromParams = (params: URLSearchParams, fallback: TimeRange = DEFAULT_RANGE): TimeRange => {
  const from = parseDate(params.get("from"));
  if (from) return { from, to: parseDate(params.get("to")) };
  const preset = params.get("range");
  return isPreset(preset) ? { preset } : fallback;
};

export const rangeToParams = (range: TimeRange): Record<string, string | undefined> =>
  isRelative(range)
    ? { range: range.preset, from: undefined, to: undefined }
    : { range: undefined, from: range.from, to: range.to };

export const sameRange = (a: TimeRange, b: TimeRange) => JSON.stringify(a) === JSON.stringify(b);
