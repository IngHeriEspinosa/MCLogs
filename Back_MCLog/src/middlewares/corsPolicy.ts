import { NextFunction, Request, RequestHandler, Response } from "express";
import cors from "cors";
import logger from "../config/logger";

/**
 * CORS con lista de origenes permitidos. Sin lista (desarrollo) se acepta
 * cualquiera; en produccion `validateConfig` exige CORS_ORIGINS.
 *
 * El rechazo se resuelve aqui y no devolviendo un error al callback de `cors`:
 * ese error acababa en el errorHandler como "Unhandled error" sin decir que
 * origen ni que ruta lo provocaban. Un origen no permitido es una peticion
 * ajena o una configuracion incompleta, no un fallo del servidor: va a `warn`
 * con lo necesario para saber de quien es.
 */
export const corsPolicy = (allowedOrigins?: string[]): RequestHandler => {
  const allowed = allowedOrigins?.length ? new Set(allowedOrigins) : undefined;
  const corsMiddleware = cors({ origin: true, credentials: true });

  return (req: Request, res: Response, next: NextFunction) => {
    // Sin Origin no es un navegador en otro sitio (curl, SDK de servidor, healthcheck).
    const origin = req.headers.origin;
    if (origin && allowed && !allowed.has(origin)) {
      logger.warn("CORS origin rejected", {
        origin,
        method: req.method,
        path: req.originalUrl.split("?")[0],
      });
      res.status(403).json({ error: "CORS origin not allowed" });
      return;
    }
    corsMiddleware(req, res, next);
  };
};
