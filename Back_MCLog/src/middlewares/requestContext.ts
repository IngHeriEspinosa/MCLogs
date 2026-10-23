import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/** Tope de la columna Log.traceId: una cabecera mas larga no se puede guardar. */
const MAX_TRACE_ID_LENGTH = 128;

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || uuidv4();
  res.locals.requestId = reqId;

  const header = req.headers["x-trace-id"];
  const incoming =
    typeof header === "string" && header.length > 0 && header.length <= MAX_TRACE_ID_LENGTH ? header : undefined;

  // Para el log de la propia peticion (requestLogger): el que venga o uno
  // nuevo, para correlacionar sus lineas.
  res.locals.traceId = incoming || (req.body?.traceId as string) || uuidv4();

  // Para los logs que se ingieren sin traceId propio: solo el que manda el
  // emisor en la cabecera. Nunca uno inventado, que convertia cada peticion
  // en una "operacion" sin serlo.
  res.locals.ingestTraceId = incoming;
  next();
};
