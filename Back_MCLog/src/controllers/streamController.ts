import { Request, Response } from "express";
import { config } from "../config/env";
import logger from "../config/logger";
import { sseConnections } from "../config/metrics";
import { LOG_CREATED, LogEvent, logEvents } from "../events/logEvents";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";

/**
 * Stream de logs en vivo por Server-Sent Events.
 *
 * Se eligió SSE y no WebSocket porque el flujo es de un solo sentido: el
 * servidor empuja, el cliente no habla. SSE va sobre HTTP normal, lo reconecta
 * el navegador solo y atraviesa los proxys sin nada especial, siempre que el
 * proxy no acumule la respuesta (en el Caddyfile de producción está resuelto
 * con `flush_interval -1`).
 */

/** Cada cuánto se manda un comentario de vida, para que nadie corte por inactividad. */
const PING_INTERVAL_MS = 25_000;

let activas = 0;

type StreamFilters = {
  level?: string;
  application?: string;
  environment?: string;
  /** Impuesto por la API key, no elegido por quien consulta. */
  applicationsIn?: string[];
};

const matches = (event: LogEvent, filters: StreamFilters): boolean => {
  if (filters.applicationsIn?.length && !filters.applicationsIn.includes(event.application)) return false;
  if (filters.level && event.level !== filters.level) return false;
  if (filters.environment && event.environment !== filters.environment) return false;
  if (filters.application && !event.application.toLowerCase().includes(filters.application.toLowerCase())) {
    return false;
  }
  return true;
};

export const streamLogs = (req: Request, res: Response) => {
  if (activas >= config.sseMaxConnections) {
    res.status(503).json({ error: "Too many live connections, try again later" });
    return;
  }

  const applications = (req as AuthenticatedRequest).apiKey?.applications;
  const filters: StreamFilters = {
    level: req.query.level as string | undefined,
    application: req.query.application as string | undefined,
    environment: req.query.environment as string | undefined,
    applicationsIn: applications && applications.length > 0 ? applications : undefined,
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Desactiva el buffer de nginx, si hay uno delante.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  activas += 1;
  sseConnections.set(activas);

  // Primer evento inmediato: confirma al cliente que la conexión está viva sin
  // tener que esperar a que llegue un log.
  res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

  const onLog = (event: LogEvent) => {
    if (!matches(event, filters)) return;
    res.write(`event: log\ndata: ${JSON.stringify(event)}\n\n`);
  };
  logEvents.on(LOG_CREATED, onLog);

  const ping = setInterval(() => res.write(": ping\n\n"), PING_INTERVAL_MS);

  const cerrar = () => {
    clearInterval(ping);
    logEvents.off(LOG_CREATED, onLog);
    activas = Math.max(0, activas - 1);
    sseConnections.set(activas);
  };

  // `close` cubre tanto que el cliente se vaya como que el servidor cierre.
  res.on("close", cerrar);
  res.on("error", (error) => {
    logger.debug("SSE connection error", { error: String(error) });
    cerrar();
  });
};

/** Solo para tests. */
export const activeStreamConnections = () => activas;
