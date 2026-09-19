import client from "prom-client";

/**
 * Registro unico de metricas Prometheus.
 *
 * Vive a nivel de modulo y no dentro de `createApp()` porque prom-client falla
 * si se registra dos veces la misma metrica, y los tests construyen la app
 * mas de una vez.
 */
export const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duracion de las peticiones HTTP, en segundos",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Logs efectivamente almacenados. La etiqueta `application` la eligen los
 * emisores, asi que su cardinalidad crece con el numero de aplicaciones
 * integradas: es baja por diseno (una por aplicacion real, no por script).
 */
export const logsIngested = new client.Counter({
  name: "mclog_logs_ingested_total",
  help: "Logs almacenados, por aplicacion y nivel",
  labelNames: ["application", "level"] as const,
  registers: [registry],
});

export const sseConnections = new client.Gauge({
  name: "mclog_sse_connections",
  help: "Conexiones abiertas al stream de logs en tiempo real",
  registers: [registry],
});

/**
 * Etiqueta de ruta estable para el histograma. Se usa el patron de Express
 * (`/logs/:id`) y no la URL real: con la URL, cada id crearia una serie
 * temporal nueva y el registro de metricas creceria sin limite.
 */
export const routeLabel = (baseUrl: string, routePath?: string): string => {
  if (!routePath) return "unmatched";
  const full = `${baseUrl}${routePath}`.replace(/\/+$/, "");
  return full === "" ? "/" : full;
};
