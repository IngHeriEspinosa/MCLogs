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

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const cookieAccess = req.cookies?.access_token as string | undefined;
  const token = header?.startsWith("Bearer ") ? header.replace("Bearer ", "") : cookieAccess;
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
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
    return true;
  };

  (async () => {
    try {
      const payload = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
      if (!payload.sub) throw new Error("Invalid token");
      req.user = {
        id: Number(payload.sub),
        email: (payload as any).email,
        role: (payload as any).role,
      };
      res.locals.user = req.user;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        try {
          await tryRefresh();
          next();
        } catch {
          res.status(401).json({ error: "Token expired and refresh failed" });
        }
      } else {
        res.status(401).json({ error: "Invalid or expired token" });
      }
    }
  })();
};
