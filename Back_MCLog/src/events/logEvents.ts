import { EventEmitter } from "events";
import { config } from "../config/env";

/**
 * Bus en memoria de logs recién ingeridos, que alimenta el stream en vivo.
 *
 * **Es por instancia.** Con varias réplicas detrás de un balanceador, cada
 * cliente conectado solo ve los logs que entraron por su misma instancia. Para
 * que fuera global habría que difundirlo con LISTEN/NOTIFY de PostgreSQL o un
 * Redis; no se hace todavía porque a esta escala no compensa la complejidad, y
 * queda documentado como la evolución natural.
 */

export type LogEvent = {
  /** Ausente en los lotes: `createMany` no devuelve las filas creadas. */
  id?: number;
  timestamp: string;
  application: string;
  service: string | null;
  host: string | null;
  level: string;
  environment: string;
  message: string;
  traceId: string | null;
  errorName: string | null;
  fingerprint: string | null;
};

export const LOG_CREATED = "log:created";

export const logEvents = new EventEmitter();

// Cada conexión SSE añade un listener. El aviso por defecto de Node salta a los
// 10 y aquí son legítimos, así que el techo es el de conexiones permitidas.
logEvents.setMaxListeners(config.sseMaxConnections + 10);

export const emitLogCreated = (event: LogEvent) => {
  // Sin oyentes no se hace trabajo: la ingesta es el camino caliente y no debe
  // pagar nada por una función que casi siempre está apagada.
  if (logEvents.listenerCount(LOG_CREATED) === 0) return;
  logEvents.emit(LOG_CREATED, event);
};
