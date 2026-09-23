import { NextFunction, RequestHandler, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config/env";
import {
  ApiKeyPrincipal,
  ApiKeyScope,
  looksLikeApiKey,
  verifyApiKey,
} from "../services/apiKeyService";
import { AuthenticatedRequest, requireAuth } from "./requireAuth";
import { getDefaultWorkspaceId } from "../services/workspaceService";

/**
 * Localiza la clave presentada en la peticion. Se acepta tanto la cabecera
 * `x-api-key` (integraciones existentes, NetSuite) como
 * `Authorization: Bearer mclog_...` (clientes MCP, que solo permiten cabeceras
 * estandar). Un Bearer que no tenga forma de clave MCLog se deja pasar para
 * que lo trate `requireAuth` como JWT.
 */
const presentedKey = (req: Request): string | undefined => {
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.trim() !== "") return header.trim();

  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (looksLikeApiKey(token)) return token;
  }
  return undefined;
};

/**
 * Clave unica heredada de la variable de entorno API_KEY. Se mantiene viva para
 * no romper los emisores ya desplegados (NetSuite, scripts) y solo puede
 * escribir logs y leer metricas: nunca consultar. Escribe en el espacio de la
 * cuenta root, que es donde estaba todo antes de que existieran los espacios.
 *
 * @deprecated Crear claves con scopes desde /api/keys.
 */
const legacyPrincipal = async (raw: string): Promise<ApiKeyPrincipal | null> => {
  const configured = config.apiKey;
  if (!configured || configured === "change-me") return null;

  const expected = Buffer.from(configured, "utf8");
  const received = Buffer.from(raw, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  const workspaceId = await getDefaultWorkspaceId();
  if (workspaceId === null) return null;

  return {
    id: 0,
    name: "API_KEY heredada",
    workspaceId,
    scopes: ["ingest", "metrics"],
    applications: [],
    legacy: true,
  };
};

/** Resuelve una clave en claro contra la heredada y contra las de base de datos. */
export const resolveApiKey = async (raw: string): Promise<ApiKeyPrincipal | null> =>
  (await legacyPrincipal(raw)) ?? (await verifyApiKey(raw));

/** Exige una API key valida que incluya el scope indicado. */
export const requireApiKey =
  (scope: ApiKeyScope): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    const raw = presentedKey(req);
    if (!raw) {
      res.status(401).json({ error: "Invalid or missing API key" });
      return;
    }
    void (async () => {
      const principal = await resolveApiKey(raw);
      if (!principal) {
        res.status(401).json({ error: "Invalid or missing API key" });
        return;
      }
      if (!principal.scopes.includes(scope)) {
        res.status(403).json({ error: `API key lacks required scope: ${scope}` });
        return;
      }
      (req as AuthenticatedRequest).apiKey = principal;
      next();
    })().catch(next);
  };

/**
 * Ingesta maquina-a-maquina: API key con scope `ingest` o, en su defecto,
 * un JWT de usuario (util para probar desde el dashboard).
 */
export const requireIngest: RequestHandler = (req, res, next) => {
  if (presentedKey(req)) {
    requireApiKey("ingest")(req, res, next);
    return;
  }
  requireAuth(req as AuthenticatedRequest, res, next);
};

/**
 * Consulta: JWT de usuario o API key con scope `read`.
 *
 * A la clave se le asigna el rol `user`, nunca `admin`: una clave jamas puede
 * purgar logs ni administrar el servicio, por muchos scopes que tenga.
 */
export const requireAuthOrReadKey: RequestHandler = (req, res, next) => {
  const raw = presentedKey(req);
  if (!raw) {
    requireAuth(req as AuthenticatedRequest, res, next);
    return;
  }
  requireApiKey("read")(req, res, (err?: unknown) => {
    if (err) return next(err as Error);
    const request = req as AuthenticatedRequest;
    if (request.apiKey) {
      request.user = { id: 0, email: `apikey:${request.apiKey.name}`, role: "user" };
      res.locals.user = request.user;
    }
    next();
  });
};
