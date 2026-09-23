import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_VERSION } from "../config/version";
import {
  DEFAULT_APPLICATIONS_HOURS,
  MAX_APPLICATIONS,
  getErrorGroups,
  getLevelTimeline,
  getLogContext,
  getTrace,
  listApplications,
} from "../services/analysisService";
import { LogFilters, getLogById, getLogStats, listLogs } from "../services/logService";

/**
 * Servidor MCP de MCLog.
 *
 * Expone la investigacion de errores como herramientas que un asistente puede
 * usar directamente, en lugar de obligarle a construir URLs y paginar a mano.
 * Llama a los servicios en proceso, sin dar la vuelta por HTTP.
 *
 * Dos criterios guian el diseno de las respuestas:
 *
 * 1. Todo lo que devuelve consume contexto del modelo, asi que los mensajes y
 *    los stacks se recortan y solo `get_log` entrega el registro completo.
 * 2. Cuando hay mas resultados de los devueltos se dice explicitamente, para
 *    que el modelo no concluya que ya lo ha visto todo.
 */

const HOUR_MS = 60 * 60 * 1000;

const MAX_MESSAGE_CHARS = 2000;
const MAX_STACK_CHARS = 4000;

const truncate = (value: string | null | undefined, max: number): string | null => {
  if (value === null || value === undefined) return null;
  return value.length <= max ? value : `${value.slice(0, max)}…[truncado, ${value.length} caracteres en total]`;
};

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

type AnyLog = {
  id: number;
  timestamp: Date;
  application: string;
  service: string | null;
  host: string | null;
  level: string;
  environment: string;
  message: string;
  traceId: string | null;
  spanId: string | null;
  metadata: unknown;
  errorName: string | null;
  errorCode: string | null;
  errorStack: string | null;
  fingerprint: string | null;
};

/** Version compacta de un log, para listados. Sin metadata ni stack completos. */
const compactLog = (log: AnyLog) => ({
  id: log.id,
  timestamp: iso(log.timestamp),
  application: log.application,
  service: log.service,
  level: log.level,
  environment: log.environment,
  message: truncate(log.message, MAX_MESSAGE_CHARS),
  traceId: log.traceId,
  errorName: log.errorName,
  errorCode: log.errorCode,
  fingerprint: log.fingerprint,
});

/** Version detallada, con metadata y stack. La usa solo `get_log`. */
const detailedLog = (log: AnyLog) => ({
  ...compactLog(log),
  host: log.host,
  spanId: log.spanId,
  errorStack: truncate(log.errorStack, MAX_STACK_CHARS),
  metadata: log.metadata,
});

/** Empaqueta la respuesta como texto JSON, que es lo que consume el cliente MCP. */
const jsonResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
});

const errorResult = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true as const,
});

/** Contexto de la peticion: su espacio y las restricciones de la API key que la autentico. */
export type McpContext = {
  /** Espacio de trabajo: las herramientas nunca ven nada fuera de el. */
  workspaceId: number;
  /** Aplicaciones visibles. Vacio o ausente = todas las del espacio. */
  applications?: string[];
};

const windowFrom = (hours: number) => ({ from: new Date(Date.now() - hours * HOUR_MS), to: new Date() });

export const buildMcpServer = (context: McpContext): McpServer => {
  const { workspaceId } = context;
  const applicationsIn = context.applications?.length ? context.applications : undefined;
  const scoped = (filters: Omit<LogFilters, "workspaceId">): LogFilters => ({ ...filters, workspaceId, applicationsIn });

  const server = new McpServer(
    { name: "mclog", version: APP_VERSION },
    {
      instructions: [
        "MCLog centraliza los logs de varias aplicaciones.",
        "Para investigar un problema, el orden util suele ser:",
        "1. list_applications si no sabes que aplicaciones existen.",
        "2. get_error_groups para ver que esta fallando y con que frecuencia.",
        "3. search_logs con el fingerprint de un grupo para ver sus ocurrencias.",
        "4. get_log para el detalle completo con stack y metadata.",
        "5. get_trace o get_log_context para entender que llevo hasta el fallo.",
        applicationsIn
          ? `Esta conexion solo alcanza estas aplicaciones: ${applicationsIn.join(", ")}.`
          : "Esta conexion alcanza todas las aplicaciones de su espacio de trabajo.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "list_applications",
    {
      title: "Listar aplicaciones",
      description:
        "Inventario de las aplicaciones que han enviado logs en la ventana (por defecto los ultimos 7 dias), con sus servicios, entornos, registros dentro de la ventana, ultima actividad y errores de las ultimas 24 horas. Empieza por aqui cuando no sepas que aplicaciones existen. Una aplicacion que lleve mas tiempo sin emitir no aparece: sube \"hours\" si buscas una que no esta.",
      inputSchema: {
        hours: z
          .number()
          .int()
          .min(24)
          .max(24 * 31)
          .optional()
          .describe(`Ventana hacia atras en horas (por defecto ${DEFAULT_APPLICATIONS_HOURS}, minimo 24)`),
      },
    },
    async ({ hours }) => {
      const { from, to } = windowFrom(hours ?? DEFAULT_APPLICATIONS_HOURS);
      const applications = await listApplications(workspaceId, applicationsIn, from);
      return jsonResult({
        window: { from: iso(from), to: iso(to) },
        total: applications.length,
        hint:
          applications.length === MAX_APPLICATIONS
            ? `Se han devuelto las ${MAX_APPLICATIONS} aplicaciones con mas logs; puede haber mas. Acota la ventana.`
            : undefined,
        applications: applications.map((app) => ({ ...app, lastSeen: iso(app.lastSeen) })),
      });
    },
  );

  server.registerTool(
    "get_error_groups",
    {
      title: "Agrupar errores",
      description:
        "Errores agrupados por causa, del mas frecuente al menos. Responde 'que esta fallando', frente a search_logs que responde 'que ha pasado'. Las ocurrencias del mismo fallo caen en un grupo aunque sus mensajes lleven ids o fechas distintos. Usa el fingerprint devuelto con search_logs para ver las ocurrencias concretas.",
      inputSchema: {
        application: z.string().max(120).optional().describe("Filtra por aplicacion (coincidencia parcial)"),
        service: z.string().max(120).optional().describe("Filtra por servicio dentro de la aplicacion"),
        environment: z.enum(["development", "staging", "production"]).optional(),
        level: z.enum(["error", "warn"]).optional().describe("Por defecto error"),
        hours: z.number().int().min(1).max(24 * 31).optional().describe("Ventana hacia atras en horas (por defecto 24)"),
        limit: z.number().int().min(1).max(50).optional().describe("Numero maximo de grupos (por defecto 20)"),
      },
    },
    async ({ application, service, environment, level, hours, limit }) => {
      const { from, to } = windowFrom(hours ?? 24);
      const max = limit ?? 20;

      const groups = await getErrorGroups(
        scoped({ application, service, environment, level: level ?? "error", from, to }),
        max,
      );

      return jsonResult({
        window: { from: iso(from), to: iso(to) },
        total: groups.length,
        hint:
          groups.length === max
            ? `Se han devuelto los ${max} grupos mas frecuentes; puede haber mas. Sube "limit" o acota la ventana.`
            : undefined,
        groups: groups.map((group) => ({
          fingerprint: group.fingerprint,
          application: group.application,
          service: group.service,
          level: group.level,
          errorName: group.errorName,
          errorCode: group.errorCode,
          count: group.count,
          firstSeen: iso(group.firstSeen),
          lastSeen: iso(group.lastSeen),
          sampleMessage: truncate(group.sampleMessage, MAX_MESSAGE_CHARS),
          lastLogId: group.lastLogId,
        })),
      });
    },
  );

  server.registerTool(
    "search_logs",
    {
      title: "Buscar logs",
      description:
        "Busca logs con filtros combinables y paginacion. Los mensajes vienen recortados y sin metadata: usa get_log con el id para el detalle completo. Para 'que esta fallando' es mejor get_error_groups.",
      inputSchema: {
        query: z.string().max(300).optional().describe("Texto libre en mensaje, aplicacion, servicio o host"),
        application: z.string().max(120).optional(),
        service: z.string().max(120).optional(),
        host: z.string().max(255).optional(),
        environment: z.enum(["development", "staging", "production"]).optional(),
        level: z.enum(["debug", "info", "warn", "error"]).optional(),
        traceId: z.string().max(128).optional().describe("Coincidencia exacta"),
        fingerprint: z.string().max(64).optional().describe("Huella de un grupo devuelto por get_error_groups"),
        from: z.string().datetime().optional().describe("Fecha ISO-8601 de inicio"),
        to: z.string().datetime().optional().describe("Fecha ISO-8601 de fin"),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional().describe("Por defecto 20"),
      },
    },
    async ({ query, application, service, host, environment, level, traceId, fingerprint, from, to, page, pageSize }) => {
      const size = pageSize ?? 20;
      const result = await listLogs(
        scoped({
          search: query,
          application,
          service,
          host,
          environment,
          level,
          traceId,
          fingerprint,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        }),
        { page: page ?? 1, pageSize: size },
        { field: "timestamp", direction: "desc" },
      );

      return jsonResult({
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        hint:
          result.page < result.totalPages
            ? `Hay ${result.total} coincidencias en total; esta es la pagina ${result.page} de ${result.totalPages}.`
            : undefined,
        logs: (result.data as unknown as AnyLog[]).map(compactLog),
      });
    },
  );

  server.registerTool(
    "get_recent_errors",
    {
      title: "Errores recientes",
      description:
        "Ultimos errores en una ventana corta, sin agrupar. Util para comprobar si algo esta fallando ahora mismo, por ejemplo despues de un despliegue.",
      inputSchema: {
        application: z.string().max(120).optional(),
        environment: z.enum(["development", "staging", "production"]).optional(),
        minutes: z.number().int().min(1).max(1440).optional().describe("Ventana en minutos (por defecto 60)"),
        level: z.enum(["warn", "error"]).optional().describe("Por defecto error"),
        limit: z.number().int().min(1).max(50).optional().describe("Por defecto 20"),
      },
    },
    async ({ application, environment, minutes, level, limit }) => {
      const windowMinutes = minutes ?? 60;
      const from = new Date(Date.now() - windowMinutes * 60 * 1000);
      const size = limit ?? 20;

      const result = await listLogs(
        scoped({ application, environment, level: level ?? "error", from }),
        { page: 1, pageSize: size },
        { field: "timestamp", direction: "desc" },
      );

      return jsonResult({
        window: { minutes: windowMinutes, from: iso(from) },
        total: result.total,
        hint:
          result.total > size
            ? `Hay ${result.total} en la ventana; se muestran los ${size} mas recientes. Usa get_error_groups para verlos agrupados.`
            : undefined,
        logs: (result.data as unknown as AnyLog[]).map(compactLog),
      });
    },
  );

  server.registerTool(
    "get_log",
    {
      title: "Detalle de un log",
      description:
        "Registro completo por id, con el stack de la excepcion y toda la metadata que adjunto la aplicacion. Es el unico que devuelve el detalle entero.",
      inputSchema: { id: z.number().int().min(1).describe("Id del log") },
    },
    async ({ id }) => {
      const log = (await getLogById(id, workspaceId)) as AnyLog | null;
      if (!log || (applicationsIn && !applicationsIn.includes(log.application))) {
        return errorResult(`No existe ningun log accesible con id ${id}.`);
      }
      return jsonResult(detailedLog(log));
    },
  );

  server.registerTool(
    "get_trace",
    {
      title: "Traza completa",
      description:
        "Todos los logs de un traceId en orden cronologico, posiblemente de varias aplicaciones. Es la forma de seguir una operacion que cruza sistemas y ver donde se rompio.",
      inputSchema: { traceId: z.string().min(1).max(128).describe("Identificador de correlacion") },
    },
    async ({ traceId }) => {
      const logs = (await getTrace(traceId, { workspaceId, applicationsIn })) as unknown as AnyLog[];
      if (logs.length === 0) return errorResult(`No hay logs accesibles con traceId "${traceId}".`);

      return jsonResult({
        traceId,
        total: logs.length,
        applications: [...new Set(logs.map((log) => log.application))],
        logs: logs.map(compactLog),
      });
    },
  );

  server.registerTool(
    "get_log_context",
    {
      title: "Contexto de un log",
      description:
        "Lo que ocurrio justo antes y despues de un log, en la misma aplicacion y servicio. Un error aislado rara vez se explica solo: lo que suele explicarlo son las lineas anteriores.",
      inputSchema: {
        id: z.number().int().min(1).describe("Id del log alrededor del cual mirar"),
        beforeSeconds: z.number().int().min(1).max(3600).optional().describe("Por defecto 60"),
        afterSeconds: z.number().int().min(1).max(3600).optional().describe("Por defecto 60"),
        limit: z.number().int().min(1).max(100).optional().describe("Por defecto 50"),
      },
    },
    async ({ id, beforeSeconds, afterSeconds, limit }) => {
      const context = await getLogContext(id, { beforeSeconds, afterSeconds, limit }, { workspaceId, applicationsIn });
      if (!context) return errorResult(`No existe ningun log accesible con id ${id}.`);

      return jsonResult({
        target: detailedLog(context.target as unknown as AnyLog),
        window: { from: iso(context.from), to: iso(context.to) },
        total: context.logs.length,
        logs: (context.logs as unknown as AnyLog[]).map(compactLog),
      });
    },
  );

  server.registerTool(
    "get_stats",
    {
      title: "Estadisticas",
      description:
        "Totales por nivel, entorno y aplicacion, mas una serie por hora. Sirve para ver de un vistazo cuando empezo a fallar algo.",
      inputSchema: {
        application: z.string().max(120).optional(),
        environment: z.enum(["development", "staging", "production"]).optional(),
        hours: z.number().int().min(1).max(24 * 31).optional().describe("Ventana de la serie (por defecto 24)"),
      },
    },
    async ({ application, environment, hours }) => {
      const { from, to } = windowFrom(hours ?? 24);
      const filters = scoped({ application, environment });

      const [summary, timeline] = await Promise.all([
        getLogStats(filters),
        getLevelTimeline(filters, from, to),
      ]);

      return jsonResult({
        ...summary,
        window: { from: iso(from), to: iso(to) },
        timeline: timeline.map((bucket) => ({ ...bucket, bucket: iso(bucket.bucket) })),
      });
    },
  );

  return server;
};
