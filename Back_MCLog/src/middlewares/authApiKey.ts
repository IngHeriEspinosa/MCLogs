import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config/env";
import { requireAuth } from "./requireAuth";

const apiKeyMatches = (headerKey: string) => {
  const expected = Buffer.from(config.apiKey);
  const received = Buffer.from(headerKey);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const headerKey = req.headers["x-api-key"] as string | undefined;
  if (!config.apiKey || config.apiKey === "change-me") {
    res.status(500).json({ error: "API key not configured" });
    return;
  }
  if (!headerKey || !apiKeyMatches(headerKey)) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
};

// Ingesta máquina-a-máquina (NetSuite, scripts, servicios): acepta x-api-key
// o, alternativamente, un JWT de usuario (para pruebas desde el dashboard).
export const requireApiKeyOrJwt = (req: Request, res: Response, next: NextFunction) => {
  const headerKey = req.headers["x-api-key"] as string | undefined;
  if (headerKey) {
    requireApiKey(req, res, next);
    return;
  }
  requireAuth(req, res, next);
};
