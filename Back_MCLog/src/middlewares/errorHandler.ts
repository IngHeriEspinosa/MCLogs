import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";
import { config } from "../config/env";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.locals.requestId;
  logger.error("Unhandled error", { err, requestId });
  const status =
    typeof err === "object" && err !== null && ((err as any).status || (err as any).statusCode)
      ? (err as any).status || (err as any).statusCode
      : 500;
  const rawMessage =
    typeof err === "object" && err !== null && (err as any).message ? (err as any).message : "Unexpected error";

  // Un 5xx no esperado puede llevar detalles internos (rutas, SQL, nombres de
  // tablas). En produccion se responde generico y el detalle queda en el log,
  // localizable por requestId. Los 4xx son mensajes pensados para el cliente.
  const message = config.nodeEnv === "production" && status >= 500 ? "Internal error" : rawMessage;
  res.status(status).json({ error: message, requestId });
};
