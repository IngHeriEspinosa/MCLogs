import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.locals.requestId;
  logger.error("Unhandled error", { err, requestId });
  const status =
    typeof err === "object" && err !== null && ((err as any).status || (err as any).statusCode)
      ? (err as any).status || (err as any).statusCode
      : 500;
  const message =
    typeof err === "object" && err !== null && (err as any).message ? (err as any).message : "Unexpected error";
  res.status(status).json({ error: message, requestId });
};
