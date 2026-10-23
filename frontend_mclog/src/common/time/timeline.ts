import type { TimelineBucket } from "@/hooks/useAuth";

const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Tope de intervalos que se rellenan. Con el intervalo adaptativo del backend
 * (5 min, 15 min, 1 h o 1 dia) ninguna ventana razonable se acerca: 5 anos por
 * dias son unos 1830. Si se pasa, se conservan los mas recientes, que son los
 * que importan; antes se cortaba por el final y desaparecian justo esos.
 */
export const MAX_FILLED_BINS = 2000;

/**
 * Los intervalos se alinean en UTC, igual que el DATE_BIN del backend.
 * Alinearlos en hora local descuadraria los husos con media hora (India,
 * Venezuela antes de 2016...) y cada barra caeria en el hueco equivocado.
 */
const floorTo = (time: number, stepMs: number) => Math.floor(time / stepMs) * stepMs;

export type TimelineBin = {
  start: number;
  end: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
  total: number;
  /**
   * El intervalo solo cae en parte dentro de la ventana: el primero si la
   * ventana empieza a mitad, y el ultimo si es el que esta en curso. Sus
   * cifras no son comparables con las de los demas, y pintarlo sin marcar
   * dibujaba una caida falsa al final de cada grafico.
   */
  partial?: boolean;
};

/**
 * Rellena los intervalos sin registros.
 *
 * La API solo devuelve los intervalos que tienen filas. Pintarlos sin mas
 * juntaria intervalos no contiguos y el grafico mentiria sobre cuando ocurrio
 * cada cosa. `bucketMs` es el intervalo de la serie (`bucketSeconds` de la
 * API); las respuestas antiguas, sin el, son por hora.
 */
export const fillTimeline = (buckets: TimelineBucket[], from: string, to: string, bucketMs = HOUR_MS): TimelineBin[] => {
  const byStart = new Map(buckets.map((bucket) => [floorTo(Date.parse(bucket.bucket), bucketMs), bucket]));
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  let last = floorTo(toMs, bucketMs);
  // Si la ventana acaba justo en un borde, el intervalo que empieza ahi queda
  // fuera salvo que traiga algo (un log con la hora exacta del final).
  if (last === toMs && !byStart.has(last)) last -= bucketMs;
  const first = Math.max(floorTo(fromMs, bucketMs), last - (MAX_FILLED_BINS - 1) * bucketMs);

  const filled: TimelineBin[] = [];
  for (let cursor = first; cursor <= last; cursor += bucketMs) {
    const bucket = byStart.get(cursor);
    const error = bucket?.error ?? 0;
    const warn = bucket?.warn ?? 0;
    const info = bucket?.info ?? 0;
    const debug = bucket?.debug ?? 0;
    const end = cursor + bucketMs;
    filled.push({
      start: cursor,
      end,
      error,
      warn,
      info,
      debug,
      total: error + warn + info + debug,
      partial: cursor < fromMs || end > toMs,
    });
  }
  return filled;
};

/** Intervalos "redondos": nadie lee bien barras de 5 o 7 horas. */
const FRIENDLY_STEPS_MS = [
  5 * MINUTE_MS,
  10 * MINUTE_MS,
  15 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  4 * HOUR_MS,
  6 * HOUR_MS,
  8 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  3 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS,
];

/**
 * Junta intervalos en otros mas anchos cuando no caben todos: con 30 dias en
 * pantalla, 720 barras de un pixel no dicen nada. El numero de barras depende
 * del ancho real, asi que en un monitor 4K se ve mas detalle que en un portatil.
 *
 * Se agrupa desde el final, para que el ultimo grupo (el mas reciente, el que
 * se mira) este completo; el que se queda corto es el primero. Un grupo con
 * algun intervalo parcial es parcial.
 */
export const binTimeline = (bins: TimelineBin[], maxBars: number): { bins: TimelineBin[]; stepMs: number } => {
  if (bins.length === 0) return { bins, stepMs: HOUR_MS };
  const baseMs = bins[0].end - bins[0].start;
  const needed = Math.max(1, Math.ceil(bins.length / Math.max(1, maxBars))) * baseMs;
  const stepMs = FRIENDLY_STEPS_MS.find((step) => step >= needed && step % baseMs === 0) ?? needed;
  const perGroup = Math.round(stepMs / baseMs);
  if (perGroup <= 1) return { bins, stepMs: baseMs };

  const grouped: TimelineBin[] = [];
  for (let end = bins.length; end > 0; end -= perGroup) {
    const chunk = bins.slice(Math.max(0, end - perGroup), end);
    grouped.unshift(
      chunk.reduce(
        (acc, bin) => ({
          ...acc,
          end: bin.end,
          error: acc.error + bin.error,
          warn: acc.warn + bin.warn,
          info: acc.info + bin.info,
          debug: acc.debug + bin.debug,
          total: acc.total + bin.total,
          partial: acc.partial || bin.partial,
        }),
        {
          start: chunk[0].start,
          end: chunk[0].end,
          error: 0,
          warn: 0,
          info: 0,
          debug: 0,
          total: 0,
          partial: chunk.length < perGroup,
        },
      ),
    );
  }
  return { bins: grouped, stepMs };
};

/**
 * Tendencia para un sparkline: solo intervalos completos. Los parciales caen
 * en los extremos, asi que quitarlos deja la serie contigua.
 */
export const trendBins = (bins: TimelineBin[], maxPoints: number) =>
  binTimeline(
    bins.filter((bin) => !bin.partial),
    maxPoints,
  ).bins;

export const sumLevels = (bins: TimelineBin[]) =>
  bins.reduce(
    (acc, bin) => ({
      error: acc.error + bin.error,
      warn: acc.warn + bin.warn,
      info: acc.info + bin.info,
      debug: acc.debug + bin.debug,
      total: acc.total + bin.total,
    }),
    { error: 0, warn: 0, info: 0, debug: 0, total: 0 },
  );

/** Intervalo con mas registros, o null si todos estan vacios. */
export const peakBin = (bins: TimelineBin[]) =>
  bins.reduce<TimelineBin | null>((best, bin) => (bin.total > (best?.total ?? 0) ? bin : best), null);
