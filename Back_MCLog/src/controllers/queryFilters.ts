import { Request } from "express";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import { workspaceIdOf } from "../middlewares/workspaceContext";
import type { LogFilters } from "../services/logService";
import { parseLevels } from "../utils/levels";

/**
 * Aplicaciones a las que esta limitada la peticion, si se autentico con una
 * API key acotada. `undefined` = sin restriccion.
 */
export const allowedApplications = (req: Request): string[] | undefined => {
  const applications = (req as AuthenticatedRequest).apiKey?.applications;
  return applications && applications.length > 0 ? applications : undefined;
};

const TEXT_FILTERS = [
  "application",
  "environment",
  "search",
  "service",
  "host",
  "traceId",
  "fingerprint",
  "message",
  "errorName",
  "errorCode",
] as const;

/**
 * Los filtros de la query, ya validados (logFilterRules), mas el espacio y la
 * restriccion de la API key. Sin ventana temporal: cada ruta la resuelve a su
 * manera.
 */
export const filtersFromQuery = (req: Request): LogFilters => {
  const text = Object.fromEntries(
    TEXT_FILTERS.map((key) => {
      const value = req.query[key];
      return [key, typeof value === "string" && value !== "" ? value : undefined];
    }),
  ) as Pick<LogFilters, (typeof TEXT_FILTERS)[number]>;

  return {
    ...text,
    workspaceId: workspaceIdOf(req),
    levels: parseLevels(req.query.level),
    applicationsIn: allowedApplications(req),
  };
};
