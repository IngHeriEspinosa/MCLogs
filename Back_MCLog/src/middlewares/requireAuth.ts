import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { refresh } from "../services/authService";
import type { ApiKeyPrincipal } from "../services/apiKeyService";
import { setAuthCookies } from "./setAuthCookies";

export type AuthenticatedUser = { id: number; email: string; role: string };

/** Espacio de trabajo sobre el que actua la peticion y el rol de quien la hace en el. */
export type WorkspaceContext = { id: number; role: "owner" | "member" };

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
  /** Presente cuando la peticion se autentico con API key en lugar de JWT. */
  apiKey?: ApiKeyPrincipal;
  /** Lo fija requireWorkspace; toda consulta de datos va acotada a el. */
  workspace?: WorkspaceContext;
};

type AuthOutcome = "ok" | "missing" | "invalid" | "refreshFailed";

/**
 * Identifica al usuario por el JWT de la cabecera o de la cookie y lo deja en
 * `req.user`. Si el token caduco, intenta renovarlo con el refresh token y
 * reescribe las cookies. No responde: eso lo decide cada middleware.
 */
const authenticate = async (req: AuthenticatedRequest, res: Response): Promise<AuthOutcome> => {
  const header = req.headers.authorization;
  const cookieAccess = req.cookies?.access_token as string | undefined;
  const token = header?.startsWith("Bearer ") ? header.replace("Bearer ", "") : cookieAccess;
  if (!token) return "missing";

  const tryRefresh = async () => {
    const refreshHeader = (req.headers["x-refresh-token"] as string | undefined) || (req.cookies?.refresh_token as string | undefined);
    if (!refreshHeader) throw new Error("No refresh token");
    const refreshed = await refresh(refreshHeader);
    setAuthCookies(res, refreshed.accessToken, refreshed.refreshToken);
    res.setHeader("x-access-token", refreshed.accessToken);
    res.setHeader("x-refresh-token", refreshed.refreshToken);
    req.headers.authorization = `Bearer ${refreshed.accessToken}`;
    req.user = {
      id: refreshed.user.id,
      email: refreshed.user.email,
      role: refreshed.user.role,
    };
    res.locals.user = req.user;
  };

  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
    if (!payload.sub) throw new Error("Invalid token");
    req.user = {
      id: Number(payload.sub),
      email: (payload as any).email,
      role: (payload as any).role,
    };
    res.locals.user = req.user;
    return "ok";
  } catch (error) {
    if (!(error instanceof jwt.TokenExpiredError)) return "invalid";
    try {
      await tryRefresh();
      return "ok";
    } catch {
      return "refreshFailed";
    }
  }
};

const FAILURE_MESSAGE: Record<Exclude<AuthOutcome, "ok">, string> = {
  missing: "Missing or invalid Authorization header",
  invalid: "Invalid or expired token",
  refreshFailed: "Token expired and refresh failed",
};

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  void authenticate(req, res).then((outcome) => {
    if (outcome === "ok") next();
    else res.status(401).json({ error: FAILURE_MESSAGE[outcome] });
  }, next);
};

/**
 * Como requireAuth, pero sin exigir sesion: si la hay, deja `req.user`; si no,
 * o si el token no vale, sigue como anonimo. Para lo que se puede ver sin
 * cuenta y ofrece algo mas a quien la tiene, como un snapshot.
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  void authenticate(req, res).then(() => next(), next);
};
