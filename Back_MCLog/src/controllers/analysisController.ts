import { Request, Response } from "express";
import logger from "../config/logger";
import { workspaceIdOf } from "../middlewares/workspaceContext";
import {
  DEFAULT_APPLICATIONS_HOURS,
  getErrorGroups,
  getFailureOccurrences,
  getLogContext,
  getTrace,
  listApplications,
  listTraces,
  getLatency,
  listReleases,
} from "../services/analysisService";
import { getSetting } from "../services/settingsService";
import {
  ErrorGroupError,
  GroupStatusFilter,
  lifecycleSummary,
  updateErrorGroups,
} from "../services/errorGroupService";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import type { GroupSort } from "../services/analysisService";
import { allowedApplications, filtersFromQuery } from "./queryFilters";

const HOUR_MS = 60 * 60 * 1000;

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
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "50", 10) || 50, 1), 200);

  try {
    const filters = filtersFromQuery(req);
    const [groups, lifecycle] = await Promise.all([
      getErrorGroups(
        {
          ...filters,
          // Por defecto solo errores: los avisos tienen huella, pero quien abre
          // esta vista busca lo que esta roto.
          levels: filters.levels ?? ["error"],
          from,
          to,
        },
        {
          limit,
          status: req.query.status as GroupStatusFilter | undefined,
          sort: (req.query.sort as GroupSort | undefined) ?? "count",
          withSeries: req.query.series === "true",
        },
      ),
      // Nuevos, regresiones, resueltos y MTTR de la ventana, para el resumen de Errores.
      lifecycleSummary(filters.workspaceId, from, to, {
        application: filters.application,
        applicationsIn: filters.applicationsIn,
      }),
    ]);

    res.json({ data: groups, lifecycle, from: from.toISOString(), to: to.toISOString() });
  } catch (error) {
    logger.error("Error retrieving error groups", { error });
    res.status(500).json({ error: "Error retrieving error groups" });
  }
};

/**
 * Cambia el estado (resolver, ignorar, reactivar) o la nota de uno o varios
 * grupos del espacio. Solo el dueno del espacio o el admin de plataforma: el
 * miembro observa.
 */
export const updateGroups = async (req: Request, res: Response) => {
  const { fingerprints, status, ignoredUntil, note } = req.body as {
    fingerprints: string[];
    status?: "active" | "resolved" | "ignored";
    ignoredUntil?: string | null;
    note?: string | null;
  };
  try {
    const updated = await updateErrorGroups(
      workspaceIdOf(req),
      fingerprints,
      { status, ignoredUntil: ignoredUntil ? new Date(ignoredUntil) : null, note },
      (req as AuthenticatedRequest).user?.id ?? null,
    );
    res.json({ updated });
  } catch (error) {
    if (error instanceof ErrorGroupError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error("Error updating error groups", { error });
    res.status(500).json({ error: "Error updating error groups" });
  }
};

export const trace = async (req: Request, res: Response) => {
  try {
    const { logs, total, omitted } = await getTrace(req.params.traceId, {
      workspaceId: workspaceIdOf(req),
      applicationsIn: allowedApplications(req),
    });
    if (logs.length === 0) {
      res.status(404).json({ error: "No logs found for that traceId" });
      return;
    }
    // `total` es la traza entera; con `truncated`, `data` lleva solo su
    // principio y su final, y faltan `omitted` logs del medio.
    res.json({ data: logs, traceId: req.params.traceId, total, truncated: omitted > 0, omitted });
  } catch (error) {
    logger.error("Error retrieving trace", { error, traceId: req.params.traceId });
    res.status(500).json({ error: "Error retrieving trace" });
  }
};

export const traces = async (req: Request, res: Response) => {
  const { from, to } = resolveWindow(req, 24);
  const page = (req.query.page as unknown as number | undefined) ?? 1;
  const pageSize = (req.query.pageSize as unknown as number | undefined) ?? 25;

  try {
    const result = await listTraces(
      { ...filtersFromQuery(req), from, to },
      { page, pageSize, onlyErrors: req.query.onlyErrors === "true" },
    );
    res.json({
      ...result,
      data: result.data.map((row) => ({ ...row, start: row.start.toISOString(), end: row.end.toISOString() })),
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } catch (error) {
    logger.error("Error listing traces", { error });
    res.status(500).json({ error: "Error listing traces" });
  }
};

export const latency = async (req: Request, res: Response) => {
  const { from, to } = resolveWindow(req, 24);
  try {
    const data = await getLatency({ ...filtersFromQuery(req), from, to });
    res.json({ data, from: from.toISOString(), to: to.toISOString() });
  } catch (error) {
    logger.error("Error retrieving latency", { error });
    res.status(500).json({ error: "Error retrieving latency" });
  }
};

export const releases = async (req: Request, res: Response) => {
  const { from, to } = resolveWindow(req, 24 * 7);
  try {
    const data = await listReleases({ ...filtersFromQuery(req), from, to });
    res.json({
      data: data.map((row) => ({ ...row, firstSeen: row.firstSeen.toISOString(), lastSeen: row.lastSeen.toISOString() })),
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } catch (error) {
    logger.error("Error retrieving releases", { error });
    res.status(500).json({ error: "Error retrieving releases" });
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
      { workspaceId: workspaceIdOf(req), applicationsIn: allowedApplications(req) },
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

export const occurrences = async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  try {
    const result = await getFailureOccurrences(id, {
      workspaceId: workspaceIdOf(req),
      applicationsIn: allowedApplications(req),
    });
    // Igual que el contexto: fuera de alcance es 404, como si no existiera.
    if (!result) {
      res.status(404).json({ error: "Log not found" });
      return;
    }

    const data = result.occurrences;
    res.json({
      // El total solo abarca lo que conserva la retencion: quien lo lea tiene
      // que saber desde cuando cuenta.
      retentionMonths: getSetting("retentionMonths"),
      data: data && {
        ...data,
        firstSeen: data.firstSeen.toISOString(),
        lastSeen: data.lastSeen.toISOString(),
        environments: data.environments.map((row) => ({
          ...row,
          firstSeen: row.firstSeen.toISOString(),
          lastSeen: row.lastSeen.toISOString(),
        })),
        recurrence: { ...data.recurrence, observedFrom: data.recurrence.observedFrom.toISOString() },
      },
    });
  } catch (error) {
    logger.error("Error retrieving failure occurrences", { error, id });
    res.status(500).json({ error: "Error retrieving failure occurrences" });
  }
};

export const applications = async (req: Request, res: Response) => {
  // Por defecto, la ultima semana (`hours`). Con `from`/`to` explicitos, la
  // ventana que pida el resumen del dashboard; `errors` cuenta entonces los de
  // esa ventana, y `errorsLast24h` sigue siendo de las ultimas 24 h.
  const explicitFrom = req.query.from as unknown as Date | undefined;
  const explicitTo = req.query.to as unknown as Date | undefined;
  const hours = (req.query.hours as unknown as number | undefined) ?? DEFAULT_APPLICATIONS_HOURS;
  const to = explicitTo ?? new Date();
  const from = explicitFrom ?? new Date(to.getTime() - hours * HOUR_MS);

  try {
    res.json({
      data: await listApplications({ ...filtersFromQuery(req), from, to: explicitTo }),
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } catch (error) {
    logger.error("Error retrieving applications", { error });
    res.status(500).json({ error: "Error retrieving applications" });
  }
};
