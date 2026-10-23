/**
 * Comparacion de una cifra con la del periodo anterior de la misma duracion.
 * La usan el resumen de Logs (en cada tarjeta) y los reportes (por fallo).
 */

export type Trend = "new" | "up" | "down" | "flat" | "unknown";

/** Un cambio cuenta si supera el 25 % y 3 ocurrencias: de 1 a 2 no es "empeorar". */
const TREND_RATIO = 0.25;
const TREND_MIN_DELTA = 3;

/** `previous` null significa que no se sabe (el periodo anterior llego al tope de grupos). */
export const trendOf = (current: number, previous: number | null): Trend => {
  if (previous === null) return "unknown";
  if (previous === 0) return current > 0 ? "new" : "flat";
  const delta = current - previous;
  if (Math.abs(delta) < TREND_MIN_DELTA || Math.abs(delta) / previous < TREND_RATIO) return "flat";
  return delta > 0 ? "up" : "down";
};

/** Cambio relativo (0,35 = +35 %), o null si no hay base con la que comparar. */
export const relativeChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : (current - previous) / previous;

/** El periodo anterior de la misma duracion: termina donde empieza este. */
export const previousWindow = (from: Date, to: Date) => ({ from: new Date(from.getTime() - (to.getTime() - from.getTime())), to: from });
