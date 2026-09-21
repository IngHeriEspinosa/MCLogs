import type { TimelineBucket } from "@/hooks/useAuth";

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Las horas se alinean en UTC, igual que el DATE_TRUNC('hour') del backend.
 * Alinearlas en hora local descuadraria los husos con media hora (India,
 * Venezuela antes de 2016...) y cada barra caeria en el hueco equivocado.
 */
const floorHour = (time: number) => Math.floor(time / HOUR_MS) * HOUR_MS;

export type TimelineBin = {
  start: number;
  end: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
  total: number;
};

/**
 * Rellena las horas sin registros.
 *
 * La API solo devuelve las horas que tienen filas. Pintarlas sin mas juntaria
 * horas no contiguas y el grafico mentiria sobre cuando ocurrio cada cosa.
 */
export const fillTimeline = (buckets: TimelineBucket[], from: string, to: string): TimelineBin[] => {
  const byHour = new Map(buckets.map((bucket) => [floorHour(new Date(bucket.bucket).getTime()), bucket]));
  const filled: TimelineBin[] = [];
  const end = floorHour(Date.parse(to));

  // Tope de seguridad: un rango absurdo no debe generar decenas de miles de barras.
  for (let cursor = floorHour(Date.parse(from)), guard = 0; cursor <= end && guard < 24 * 62; cursor += HOUR_MS, guard++) {
    const bucket = byHour.get(cursor);
    const error = bucket?.error ?? 0;
    const warn = bucket?.warn ?? 0;
    const info = bucket?.info ?? 0;
    const debug = bucket?.debug ?? 0;
    filled.push({ start: cursor, end: cursor + HOUR_MS, error, warn, info, debug, total: error + warn + info + debug });
  }
  return filled;
};

/** Agrupaciones "redondas" en horas: nadie lee bien barras de 5 o 7 horas. */
const FRIENDLY_STEPS = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 168];

/**
 * Junta horas en intervalos mas anchos cuando no caben todas: con 30 dias en
 * pantalla, 720 barras de un pixel no dicen nada. El numero de barras depende
 * del ancho real, asi que en un monitor 4K se ve mas detalle que en un portatil.
 */
export const binTimeline = (hours: TimelineBin[], maxBars: number): { bins: TimelineBin[]; stepHours: number } => {
  const needed = Math.max(1, Math.ceil(hours.length / Math.max(1, maxBars)));
  const stepHours = FRIENDLY_STEPS.find((step) => step >= needed) ?? needed;
  if (stepHours === 1) return { bins: hours, stepHours };

  const bins: TimelineBin[] = [];
  for (let index = 0; index < hours.length; index += stepHours) {
    const chunk = hours.slice(index, index + stepHours);
    const bin = chunk.reduce(
      (acc, hour) => ({
        ...acc,
        end: hour.end,
        error: acc.error + hour.error,
        warn: acc.warn + hour.warn,
        info: acc.info + hour.info,
        debug: acc.debug + hour.debug,
        total: acc.total + hour.total,
      }),
      { start: chunk[0].start, end: chunk[0].end, error: 0, warn: 0, info: 0, debug: 0, total: 0 },
    );
    bins.push(bin);
  }
  return { bins, stepHours };
};

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
