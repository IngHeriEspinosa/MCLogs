import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";
import { config } from "../config/env";

/**
 * Winston serializa un Error con JSON.stringify, que se salta `message` y
 * `stack` (no son enumerables): en el log solo quedaba `{"status":403}`.
 * Se eligen los campos en vez de copiarlos todos: el error de JSON mal formado
 * de express.json trae el body crudo, que puede llevar una contrasena.
 */
export const describeError = (err: unknown) => {
  if (!(err instanceof Error)) return err;
  const { code, type } = err as Error & { code?: unknown; type?: unknown };
  return { name: err.name, message: err.message, code, type, stack: err.stack };
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.locals.requestId;
  const status =
    typeof err === "object" && err !== null && ((err as any).status || (err as any).statusCode)
      ? (err as any).status || (err as any).statusCode
      : 500;
  const rawMessage =
    typeof err === "object" && err !== null && (err as any).message ? (err as any).message : "Unexpected error";

  // Un 4xx que llega aqui (JSON mal formado, body demasiado grande) es culpa de
  // la peticion, no del servidor: se avisa, pero no cuenta como error.
  logger.log(status >= 500 ? "error" : "warn", status >= 500 ? "Unhandled error" : "Request rejected", {
    err: describeError(err),
    status,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    requestId,
  });

  // Un 5xx no esperado puede llevar detalles internos (rutas, SQL, nombres de
  // tablas). En produccion se responde generico y el detalle queda en el log,
  // localizable por requestId. Los 4xx son mensajes pensados para el cliente.
  const message = config.nodeEnv === "production" && status >= 500 ? "Internal error" : rawMessage;
  res.status(status).json({ error: message, requestId });
};
