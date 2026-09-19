import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || uuidv4();
  res.locals.requestId = reqId;
  // TraceId opcional: si viene en body se respeta; si no, generamos uno para logging
  const traceId = (req.headers["x-trace-id"] as string) || (req.body?.traceId as string) || uuidv4();
  res.locals.traceId = traceId;
  next();
};
