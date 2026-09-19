import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";

export const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  if (!config.forceHttps) return next();
  const proto = req.headers["x-forwarded-proto"] || (req.connection as any).encrypted ? "https" : req.protocol;
  if (proto !== "https") {
    res.status(400).json({ error: "HTTPS required" });
    return;
  }
  next();
};
