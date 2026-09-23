import { NextFunction, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "./requireAuth";

/**
 * Exige ser la cuenta root (ADMIN_EMAIL). Va despues de requireAuth.
 *
 * Se consulta en base de datos en lugar de leer el JWT: el token no lleva la
 * marca de root, y si ADMIN_EMAIL cambia, la cuenta anterior deja de serlo en
 * el siguiente arranque sin esperar a que caduque su sesion.
 */
export const requireRoot = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  void (async () => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { isRoot: true } });
    if (!user?.isRoot) {
      res.status(403).json({ error: "Requires the root account" });
      return;
    }
    next();
  })().catch(next);
};
