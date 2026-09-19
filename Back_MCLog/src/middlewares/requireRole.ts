import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./requireAuth";

export const requireRole = (role: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: `Requires role: ${role}` });
      return;
    }
    next();
  };
};
