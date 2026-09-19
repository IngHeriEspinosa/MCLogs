import { Request, Response } from "express";
import logger from "../config/logger";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  getErrorGroups,
  getLogContext,
  getTrace,
  listApplications,
} from "../services/analysisService";

const HOUR_MS = 60 * 60 * 1000;

/** Aplicaciones a las que esta limitada la peticion, si vino con una API key acotada. */
const allowedApplications = (req: Request): string[] | undefined => {
  const applications = (req as AuthenticatedRequest).apiKey?.applications;
  return applications && applications.length > 0 ? applications : undefined;
};

/**
 * Ventana temporal de la consulta. Se puede dar explicita con `from`/`to`, o
 * de forma relativa con `hours`, que es lo comodo al preguntar "que ha fallado
 * hoy" sin tener que calcular fechas ISO.
 */
const resolveWindow = (req: Request, defaultHours: number) => {
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  if (req.query.from) return { from: new Date(req.query.from as string), to };

  const hours = Number(req.query.hours);
  const effective = Number.isFinite(hours) && hours > 0 ? hours : defaultHours;
  return { from: new Date(to.getTime() - effective * HOUR_MS), to };
};

export const errorGroups = async (req: Request, res: Response) => {
  const { from, to } = resolveWindow(req, 24);
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "50", 10) || 50, 1), 100);

  try {
    const groups = await getErrorGroups(
      {
        application: req.query.application as string | undefined,
        service: req.query.service as string | undefined,
        environment: req.query.environment as string | undefined,
        // Por defecto solo errores: los avisos tienen huella, pero quien abre
        // esta vista busca lo que esta roto.
        level: (req.query.level as string | undefined) ?? "error",
        from,
        to,
        applicationsIn: allowedApplications(req),
      },
      limit,
    );

    res.json({ data: groups, from: from.toISOString(), to: to.toISOString() });
  } catch (error) {
    logger.error("Error retrieving error groups", { error });
    res.status(500).json({ error: "Error retrieving error groups" });
  }
};

export const trace = async (req: Request, res: Response) => {
  try {
    const logs = await getTrace(req.params.traceId, { applicationsIn: allowedApplications(req) });
    if (logs.length === 0) {
      res.status(404).json({ error: "No logs found for that traceId" });
      return;
    }
    res.json({ data: logs, traceId: req.params.traceId, total: logs.length });
  } catch (error) {
    logger.error("Error retrieving trace", { error, traceId: req.params.traceId });
    res.status(500).json({ error: "Error retrieving trace" });
  }
};

export const logContext = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const beforeSeconds = Math.min(Math.max(parseInt((req.query.before as string) ?? "60", 10) || 60, 1), 3600);
  const afterSeconds = Math.min(Math.max(parseInt((req.query.after as string) ?? "60", 10) || 60, 1), 3600);
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "50", 10) || 50, 1), 200);

  try {
    const context = await getLogContext(
      id,
      { beforeSeconds, afterSeconds, limit },
      { applicationsIn: allowedApplications(req) },
    );
    // Fuera de alcance se responde 404 igual que si no existiera, para no
    // confirmar la existencia de logs de otras aplicaciones.
    if (!context) {
      res.status(404).json({ error: "Log not found" });
      return;
    }

    res.json({
      target: context.target,
      from: context.from.toISOString(),
      to: context.to.toISOString(),
      data: context.logs,
      total: context.logs.length,
    });
  } catch (error) {
    logger.error("Error retrieving log context", { error, id });
    res.status(500).json({ error: "Error retrieving log context" });
  }
};

export const applications = async (req: Request, res: Response) => {
  try {
    res.json({ data: await listApplications(allowedApplications(req)) });
  } catch (error) {
    logger.error("Error retrieving applications", { error });
    res.status(500).json({ error: "Error retrieving applications" });
  }
};
