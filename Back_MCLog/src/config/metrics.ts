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

/** Valores distintos de `application` que se etiquetan; los siguientes cuentan como OTHER_APPLICATION. */
export const MAX_APPLICATION_LABELS = 200;
export const OTHER_APPLICATION = "__other__";
const labelledApplications = new Set<string>();

/**
 * Etiqueta `application` acotada. La eligen los emisores: un cliente que
 * genere nombres al vuelo (un id por script, por ejemplo) crearia una serie
 * temporal por nombre y haria crecer sin limite la memoria del proceso y la
 * de Prometheus. Las primeras MAX_APPLICATION_LABELS conservan su nombre; las
 * demas se suman en OTHER_APPLICATION.
 */
export const applicationLabel = (application: string): string => {
  if (labelledApplications.has(application)) return application;
  if (labelledApplications.size >= MAX_APPLICATION_LABELS) return OTHER_APPLICATION;
  labelledApplications.add(application);
  return application;
};

/** Logs efectivamente almacenados, con `application` acotada (applicationLabel). */
export const logsIngested = new client.Counter({
  name: "mclog_logs_ingested_total",
  help: "Logs almacenados, por aplicacion y nivel",
  labelNames: ["application", "level"] as const,
  registers: [registry],
});

/**
 * Retraso entre el `timestamp` que trae el log y su llegada. Solo cuenta los
 * logs que lo traen: sin el, el servidor pone la hora de llegada y el retraso
 * es cero por definicion. Un percentil alto avisa de emisores que acumulan y
 * envian tarde (lotes de NetSuite, colas reintentando).
 */
export const ingestLag = new client.Histogram({
  name: "mclog_ingest_lag_seconds",
  help: "Retraso entre el timestamp del log y su ingesta, en segundos",
  buckets: [1, 5, 15, 60, 300, 900, 3600, 21600, 86400],
  registers: [registry],
});

/** Logs que no se guardaron, por motivo: validation, scope, batch_too_large, otlp_malformed. */
export const logsRejected = new client.Counter({
  name: "mclog_logs_rejected_total",
  help: "Logs rechazados en la ingesta, por motivo",
  labelNames: ["reason"] as const,
  registers: [registry],
});

/** Cada evaluacion de una regla: triggered, quiet (no se cumple o en cooldown) o error. */
export const alertEvaluations = new client.Counter({
  name: "mclog_alert_evaluations_total",
  help: "Evaluaciones de reglas de alerta, por tipo de regla y resultado",
  labelNames: ["rule_type", "outcome"] as const,
  registers: [registry],
});

/** Envios por canal: kind es trigger, resolve o digest; result, ok o failed. */
export const alertDeliveries = new client.Counter({
  name: "mclog_alert_deliveries_total",
  help: "Envios de avisos y resumenes, por tipo de canal, clase y resultado",
  labelNames: ["channel_type", "kind", "result"] as const,
  registers: [registry],
});

/** Duracion de cada pasada del planificador (retencion, alertas, resumenes...). */
export const schedulerJobDuration = new client.Histogram({
  name: "mclog_scheduler_job_duration_seconds",
  help: "Duracion de los trabajos del planificador, por trabajo y resultado",
  labelNames: ["job", "outcome"] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300],
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
