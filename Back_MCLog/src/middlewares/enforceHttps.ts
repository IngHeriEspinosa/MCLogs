import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";

export const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  if (!config.forceHttps) return next();
  // `x-forwarded-proto` puede llegar como lista ("https, http") si la peticion
  // atraviesa varios proxies: el primer salto es el que habla con el cliente.
  const forwarded = req.headers["x-forwarded-proto"];
  const forwardedProto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim();
  const proto = forwardedProto || ((req.socket as any).encrypted ? "https" : req.protocol);
  if (proto !== "https") {
    res.status(400).json({ error: "HTTPS required" });
    return;
  }
  next();
};
