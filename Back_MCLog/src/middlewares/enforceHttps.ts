import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";

/**
 * El HEALTHCHECK del contenedor llama a http://127.0.0.1:3000/health por HTTP
 * plano: no pasa por el proxy, asi que nunca trae `x-forwarded-proto`. Exigirle
 * HTTPS lo deja en 400 para siempre, el orquestador marca el contenedor como
 * unhealthy y lo reinicia en bucle. Una peticion que nace y muere dentro del
 * contenedor no viaja por ninguna red que cifrar.
 */
const isLoopback = (req: Request) => {
  const ip = req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
};

export const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  if (!config.forceHttps) return next();
  if (isLoopback(req)) return next();
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
