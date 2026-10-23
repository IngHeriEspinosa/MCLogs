import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/** Tope de la columna Log.traceId: una cabecera mas larga no se puede guardar. */
const MAX_TRACE_ID_LENGTH = 128;

/** W3C Trace Context: version-traceid-spanid-flags, todo en hexadecimal en minusculas. */
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/**
 * traceId y spanId de una cabecera `traceparent` (OpenTelemetry y cualquier
 * cliente W3C), o null si falta o no es valida. Los identificadores todo
 * ceros son invalidos segun la especificacion.
 */
export const parseTraceparent = (value: unknown): { traceId: string; spanId: string } | null => {
  if (typeof value !== "string") return null;
  const match = TRACEPARENT.exec(value.trim().toLowerCase());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1], spanId: match[2] };
};

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
  // emisor, en x-trace-id o en traceparent. Nunca uno inventado, que
  // convertia cada peticion en una "operacion" sin serlo. traceparent aporta
  // ademas el tramo, para los logs que no traen spanId.
  const traceparent = parseTraceparent(req.headers.traceparent);
  res.locals.ingestTraceId = incoming ?? traceparent?.traceId;
  res.locals.ingestSpanId = traceparent?.spanId;
  next();
};
