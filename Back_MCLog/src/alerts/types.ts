import type { AlertChannel } from "@prisma/client";

/** Resumen de un log dentro de un aviso. Lo justo para entender qué pasa. */
export type AlertSample = {
  id: number;
  timestamp: string;
  application: string;
  service: string | null;
  level: string;
  message: string;
  errorName: string | null;
  /** Para buscar las demás ocurrencias del mismo fallo. */
  fingerprint: string | null;
  /** Para seguir la operación en la que falló. */
  traceId: string | null;
};

/** Lo que recibe cada canal cuando una regla se dispara. */
export type AlertPayload = {
  rule: { id: number; name: string; type: string };
  /** trigger = se cumple la condición; resolve = se ha despejado (reglas continuas). */
  kind: "trigger" | "resolve";
  triggeredAt: string;
  /** Coincidencias en la ventana (o grupos nuevos, según el tipo de regla). */
  count: number;
  windowMinutes: number;
  threshold: number;
  application: string | null;
  environment: string | null;
  level: string;
  /** Una línea que explica la condición: "12 % de errores (30 de 250, umbral 5 %)". */
  summary: string;
  samples: AlertSample[];
  /** Enlace al dashboard con los filtros ya puestos, si hay URL pública configurada. */
  dashboardUrl: string | null;
};

/**
 * Envía un aviso por un canal. Lanza si falla: quien orquesta decide qué hacer
 * con el fallo, para que un canal caído no impida avisar por los demás.
 */
export type Notifier = (channel: AlertChannel, payload: AlertPayload) => Promise<void>;

/** Timeout de cada envío. Un canal lento no debe bloquear la evaluación. */
export const NOTIFIER_TIMEOUT_MS = 10_000;

/** Línea de texto plano de una muestra, compartida por los tres canales. */
export const formatSample = (sample: AlertSample): string => {
  const hora = new Date(sample.timestamp).toISOString().slice(11, 19);
  const servicio = sample.service && sample.service !== sample.application ? `/${sample.service}` : "";
  const clase = sample.errorName ? `${sample.errorName}: ` : "";
  return `${hora} · ${sample.application}${servicio} · ${clase}${sample.message}`;
};

/** Título de una línea, común a todos los canales. */
export const alertTitle = (payload: AlertPayload): string => {
  const { rule, count, windowMinutes } = payload;
  if (payload.kind === "resolve") return `[MCLog] Recuperada: ${rule.name}`;
  switch (rule.type) {
    case "new_error_group":
      return `[MCLog] ${count === 1 ? "1 error nuevo" : `${count} errores nuevos`}: ${rule.name}`;
    case "regression":
      return `[MCLog] ${count === 1 ? "1 fallo resuelto ha vuelto" : `${count} fallos resueltos han vuelto`}: ${rule.name}`;
    case "silence":
      return `[MCLog] ${rule.name}: sin logs en ${windowMinutes} min`;
    case "error_rate":
      return `[MCLog] ${rule.name}: tasa de error al alza`;
    case "spike":
      return `[MCLog] ${rule.name}: pico de ${count} en ${windowMinutes} min`;
    default:
      return `[MCLog] ${rule.name}: ${count} en ${windowMinutes} min`;
  }
};
