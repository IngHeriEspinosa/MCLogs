/**
 * Traduccion de OTLP/HTTP JSON (logs de OpenTelemetry) a entradas de MCLog.
 *
 * Con esto cualquier SDK de OpenTelemetry (Python, Java, .NET, Go...) o un
 * colector (OTel Collector, Vector, Fluent Bit) envia a MCLog sin libreria
 * propia: basta apuntar el exportador OTLP a `<api>/v1/logs` con la API key.
 *
 * El resultado sigue luego el mismo camino que `POST /api/logs/batch`
 * (normalizacion, recorte, validacion y guardado). Aqui se recortan ademas los
 * campos de configuracion (aplicacion, servicio, host...) a su tope: un
 * `service.name` largo no debe tumbar todo el envio de un colector.
 *
 * Referencia: https://opentelemetry.io/docs/specs/otlp/ y el modelo de datos
 * de logs (https://opentelemetry.io/docs/specs/otel/logs/data-model/).
 */

type Level = "debug" | "info" | "warn" | "error";
type Environment = "development" | "staging" | "production";

export type OtlpLogEntry = {
  application: string;
  service: string;
  level: Level;
  environment: Environment;
  message: string;
  host?: string;
  timestamp?: string;
  traceId?: string;
  spanId?: string;
  release?: string;
  errorName?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
};

export type OtlpTranslation = {
  logs: OtlpLogEntry[];
  /** Registros descartados por no tener forma de LogRecord. */
  rejected: number;
};

const MAX_APPLICATION = 120;
const MAX_SERVICE = 120;
const MAX_HOST = 255;
const MAX_RELEASE = 120;
/** Atributos por log en metadata, y profundidad de los valores anidados. */
const MAX_ATTRIBUTES = 100;
const MAX_DEPTH = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/** Valor JSON de un `AnyValue` de OTLP (stringValue, intValue, kvlistValue...). */
const fromAnyValue = (value: unknown, depth = 0): unknown => {
  if (!isRecord(value) || depth > MAX_DEPTH) return null;
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.boolValue === "boolean") return value.boolValue;
  // intValue llega como cadena en JSON (int64); se deja en numero si cabe sin perder precision.
  if (typeof value.intValue === "string" || typeof value.intValue === "number") {
    const parsed = Number(value.intValue);
    return Number.isSafeInteger(parsed) ? parsed : String(value.intValue);
  }
  if (typeof value.doubleValue === "number") return value.doubleValue;
  if (typeof value.bytesValue === "string") return value.bytesValue;
  if (isRecord(value.arrayValue) && Array.isArray(value.arrayValue.values)) {
    return value.arrayValue.values.slice(0, MAX_ATTRIBUTES).map((item) => fromAnyValue(item, depth + 1));
  }
  if (isRecord(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) {
    return attributesOf(value.kvlistValue.values, depth + 1);
  }
  return null;
};

/** Lista de `KeyValue` de OTLP como objeto plano, con tope de claves. */
const attributesOf = (list: unknown, depth = 0): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(list)) return out;
  for (const item of list.slice(0, MAX_ATTRIBUTES)) {
    if (isRecord(item) && typeof item.key === "string" && item.key !== "") out[item.key] = fromAnyValue(item.value, depth);
  }
  return out;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Nivel de MCLog a partir de `severityNumber` (1-4 TRACE, 5-8 DEBUG, 9-12
 * INFO, 13-16 WARN, 17-24 ERROR y FATAL) o, si no viene, de `severityText`.
 */
export const levelOf = (severityNumber: unknown, severityText: unknown): Level => {
  const number = typeof severityNumber === "number" ? severityNumber : Number(severityNumber);
  if (Number.isFinite(number) && number > 0) {
    if (number >= 17) return "error";
    if (number >= 13) return "warn";
    if (number >= 9) return "info";
    return "debug";
  }
  const name = typeof severityText === "string" ? severityText.trim().toLowerCase() : "";
  if (/^(fatal|crit|critical|emerg|alert|error|err|severe)/.test(name)) return "error";
  if (/^warn/.test(name)) return "warn";
  if (/^(debug|trace|fine)/.test(name)) return "debug";
  return "info";
};

/** `deployment.environment(.name)` a uno de los tres entornos de MCLog; sin el, development. */
export const environmentOf = (value: unknown): Environment => {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^(prod|production|live|prd)$/.test(name)) return "production";
  if (/^(stag|staging|stage|preprod|pre-production|uat|qa|test|testing)$/.test(name)) return "staging";
  return "development";
};

/** Nanosegundos Unix (cadena o numero) a ISO-8601; undefined si faltan o son 0. */
export const isoFromUnixNano = (value: unknown): string | undefined => {
  // Como cadena (lo normal: int64 en JSON) se quitan los seis ultimos digitos,
  // exacto y sin BigInt; como numero ya llega con la precision que tenga.
  let millis: number;
  if (typeof value === "string" && /^\d+$/.test(value)) millis = value.length > 6 ? Number(value.slice(0, -6)) : 0;
  else if (typeof value === "number" && Number.isFinite(value)) millis = Math.floor(value / 1_000_000);
  else return undefined;
  if (millis <= 0) return undefined;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/**
 * traceId o spanId de OTLP/JSON. La especificacion los manda en hexadecimal,
 * pero algunos conversores de protobuf a JSON los dejan en base64: se aceptan
 * los dos. Los todo ceros significan "sin traza".
 */
export const otlpId = (value: unknown, bytes: 8 | 16): string | undefined => {
  if (typeof value !== "string" || value === "") return undefined;
  const hexLength = bytes * 2;
  let hex = value.toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${hexLength}}$`).test(hex)) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length !== bytes) return undefined;
    hex = decoded.toString("hex");
  }
  return /^0+$/.test(hex) ? undefined : hex;
};

/** Cuerpo del log como texto: una cadena tal cual y cualquier otro valor en JSON. */
const messageOf = (body: unknown): string | undefined => {
  const value = fromAnyValue(body);
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? text(value) : JSON.stringify(value);
};

/** Atributos de recurso que ya tienen columna propia y no se repiten en metadata. */
const MAPPED_RESOURCE = new Set([
  "service.name",
  "service.namespace",
  "service.version",
  "host.name",
  "deployment.environment",
  "deployment.environment.name",
  "mclog.application",
]);
const MAPPED_RECORD = new Set(["exception.type", "exception.message", "exception.stacktrace"]);

const without = (source: Record<string, unknown>, keys: Set<string>) =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.has(key)));

/** Traduce el cuerpo de `POST /v1/logs` (ExportLogsServiceRequest) a logs de MCLog. */
export const translateOtlpLogs = (payload: unknown): OtlpTranslation => {
  const logs: OtlpLogEntry[] = [];
  let rejected = 0;
  const resourceLogs = isRecord(payload) && Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];

  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) continue;
    const resource = attributesOf(isRecord(resourceLog.resource) ? resourceLog.resource.attributes : undefined);
    const serviceName = text(resource["service.name"]) ?? "unknown_service";
    // La aplicacion es el sistema y el servicio su componente: con
    // service.namespace (o mclog.application) se separan; sin el, coinciden.
    const application = clip(text(resource["mclog.application"]) ?? text(resource["service.namespace"]) ?? serviceName, MAX_APPLICATION);
    const service = clip(serviceName, MAX_SERVICE);
    const environment = environmentOf(resource["deployment.environment.name"] ?? resource["deployment.environment"]);
    const host = text(resource["host.name"]);
    const release = text(resource["service.version"]);
    const resourceRest = without(resource, MAPPED_RESOURCE);

    const scopeLogs = Array.isArray(resourceLog.scopeLogs) ? resourceLog.scopeLogs : [];
    for (const scopeLog of scopeLogs) {
      if (!isRecord(scopeLog)) continue;
      const scopeName = isRecord(scopeLog.scope) ? text(scopeLog.scope.name) : undefined;
      const records = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];

      for (const record of records) {
        if (!isRecord(record)) {
          rejected += 1;
          continue;
        }
        const attributes = attributesOf(record.attributes);
        const exceptionType = text(attributes["exception.type"]);
        const exceptionMessage = text(attributes["exception.message"]);
        const exceptionStack = text(attributes["exception.stacktrace"]);
        const message = messageOf(record.body) ?? exceptionMessage ?? text(record.severityText) ?? "OTLP log record";

        const otel: Record<string, unknown> = {};
        if (scopeName) otel.scope = scopeName;
        if (text(record.severityText)) otel.severityText = text(record.severityText);
        const recordRest = without(attributes, MAPPED_RECORD);
        const metadata: Record<string, unknown> = { ...recordRest };
        if (Object.keys(otel).length > 0) metadata.otel = otel;
        if (Object.keys(resourceRest).length > 0) metadata.resource = resourceRest;

        const entry: OtlpLogEntry = {
          application,
          service,
          environment,
          level: levelOf(record.severityNumber, record.severityText),
          message,
        };
        if (host) entry.host = clip(host, MAX_HOST);
        if (release) entry.release = clip(release, MAX_RELEASE);
        const timestamp = isoFromUnixNano(record.timeUnixNano) ?? isoFromUnixNano(record.observedTimeUnixNano);
        if (timestamp) entry.timestamp = timestamp;
        const traceId = otlpId(record.traceId, 16);
        const spanId = otlpId(record.spanId, 8);
        if (traceId) entry.traceId = traceId;
        if (spanId) entry.spanId = spanId;
        const errorName = exceptionType ?? text(attributes["error.type"]);
        if (errorName) entry.errorName = errorName;
        if (exceptionStack) entry.errorStack = exceptionStack;
        if (Object.keys(metadata).length > 0) entry.metadata = metadata;
        logs.push(entry);
      }
    }
  }
  return { logs, rejected };
};
