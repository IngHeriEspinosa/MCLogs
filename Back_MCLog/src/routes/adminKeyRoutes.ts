import express, { RequestHandler, Response } from "express";
import { param, validationResult } from "express-validator";
import logger from "../config/logger";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { queryLimiter } from "../middlewares/rateLimiters";
import { getApiKeyInventory } from "../services/apiKeyInventoryService";
import { revokeAnyApiKey } from "../services/apiKeyService";

/**
 * Inventario de API keys de toda la plataforma: solo el admin de plataforma
 * (root incluida), igual que la administracion de cuentas.
 *
 * Exige sesion de usuario: una API key nunca llega aqui, porque la clave se
 * autentica siempre con rol `user` y no pasa `requireAuth` como JWT.
 */
const router = express.Router();

router.use(queryLimiter, requireAuth, requireRole("admin"));

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

router.get("/", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getApiKeyInventory());
  } catch (error) {
    logger.error("Error listing API key inventory", { error });
    res.status(500).json({ error: "Error listing API key inventory" });
  }
});

// Revocar cualquier clave, de cualquier espacio. Idempotente.
router.delete(
  "/:id",
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const revoked = await revokeAnyApiKey(Number(req.params.id));
      if (!revoked) {
        res.status(404).json({ error: "API key not found" });
        return;
      }
      logger.info("API key revoked by platform admin", {
        id: revoked.id,
        name: revoked.name,
        prefix: revoked.prefix,
        workspaceId: revoked.workspaceId,
        by: req.user?.email,
      });
      res.json({ data: revoked });
    } catch (error) {
      logger.error("Error revoking API key", { error });
      res.status(500).json({ error: "Error revoking API key" });
    }
  },
);

export default router;
