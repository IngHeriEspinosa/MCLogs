import rateLimit from "express-rate-limit";
import { config } from "../config/env";

// Consultas del dashboard / API de lectura
export const queryLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

// Ingesta de logs: ventana corta y límite alto para no frenar aplicaciones emisoras
export const ingestLimiter = rateLimit({
  windowMs: config.ingestRateLimitWindowMs,
  limit: config.ingestRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
