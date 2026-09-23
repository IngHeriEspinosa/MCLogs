import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config/env";

/**
 * Identifica al cliente por IP. Las IPv6 se reducen a su prefijo /64 porque un
 * mismo cliente suele disponer de ese rango entero y podria rotar direcciones
 * para esquivar el limite.
 */
const ipBucket = (req: Request): string => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!ip.includes(":")) return `ip:${ip}`;
  const groups = ip.split(":");
  return `ip6:${groups.slice(0, 4).join(":")}`;
};

/**
 * Parte publica de la API key presentada, sin validarla: basta para separar
 * cubetas de rate limiting y evita tener que autenticar antes de limitar.
 */
const apiKeyBucket = (req: Request): string | undefined => {
  const header = req.headers["x-api-key"];
  const authorization = req.headers.authorization;
  const raw =
    typeof header === "string" && header.trim() !== ""
      ? header.trim()
      : authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : undefined;
  if (!raw) return undefined;

  const parts = raw.split("_");
  if (parts.length >= 3 && parts[0] === "mclog") return `key:${parts[0]}_${parts[1]}`;
  // Clave heredada o token opaco: se agrupa por longitud para no registrar el secreto.
  return `key:legacy:${raw.length}`;
};

// Consultas del dashboard / API de lectura
export const queryLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => apiKeyBucket(req) ?? ipBucket(req),
});

/**
 * Ingesta de logs: ventana corta y limite alto para no frenar a las
 * aplicaciones emisoras. Se cuenta por clave cuando la hay, de modo que una
 * integracion ruidosa no consume la cuota de las demas que salgan por la
 * misma IP (tipico detras de un NAT o de NetSuite).
 */
export const ingestLimiter = rateLimit({
  windowMs: config.ingestRateLimitWindowMs,
  limit: config.ingestRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => apiKeyBucket(req) ?? ipBucket(req),
});

/**
 * Login: ventana estrecha contra fuerza bruta. Solo cuentan los intentos
 * fallidos, asi que un usuario legitimo nunca se autobloquea.
 */
export const loginLimiter = rateLimit({
  windowMs: config.loginRateLimitWindowMs,
  limit: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: ipBucket,
  message: { error: "Too many login attempts, try again later" },
});

/**
 * Peticion de enlace para restablecer la contrasena. Cuenta todas, no solo las
 * fallidas: la respuesta es la misma exista o no la cuenta, y cada peticion
 * valida puede enviar un correo.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: config.passwordResetRateLimitWindowMs,
  limit: config.passwordResetRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipBucket,
  message: { error: "Too many password reset requests, try again later" },
});
