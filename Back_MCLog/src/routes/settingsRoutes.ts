import express, { Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import logger from "../config/logger";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { queryLimiter } from "../middlewares/rateLimiters";
import { requireRoot } from "../middlewares/requireRoot";
import {
  HISTORY_PAGE_MAX,
  SettingsValidationError,
  getSetting,
  listSettingChanges,
  listSettings,
  resetSetting,
  updateSettings,
} from "../services/settingsService";

/**
 * Configuracion de la aplicacion.
 *
 * `/public` lo lee cualquier sesion: son las pocas banderas que el panel
 * necesita para no ofrecer lo que esta apagado. El resto es solo de la cuenta
 * root, que es la unica que ve y cambia la configuracion.
 */
const router = express.Router();

router.use(queryLimiter, requireAuth);

router.get("/public", (req: AuthenticatedRequest, res: Response) => {
  res.json({
    data: {
      labEnabled: getSetting("labEnabled"),
      mcpEnabled: getSetting("mcpEnabled"),
      // Los admins de plataforma pueden crear espacios aunque este apagado para el resto.
      canCreateWorkspace: getSetting("allowWorkspaceCreation") || req.user?.role === "admin",
      maxWorkspaceMembers: getSetting("maxWorkspaceMembers"),
      invitationTtlDays: getSetting("invitationTtlDays"),
      publicSnapshotsEnabled: getSetting("publicSnapshotsEnabled"),
      maxSnapshotRows: getSetting("maxSnapshotRows"),
      maxSnapshotsPerWorkspace: getSetting("maxSnapshotsPerWorkspace"),
    },
  });
});

router.use(requireRoot);

const respondWithError = (error: unknown, res: Response, context: string) => {
  if (error instanceof SettingsValidationError) {
    res.status(400).json({ error: "Invalid settings", errors: error.errors });
    return;
  }
  logger.error(context, { error });
  res.status(500).json({ error: context });
};

router.get("/", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ data: await listSettings() });
  } catch (error) {
    respondWithError(error, res, "Error listing settings");
  }
});

// Quien cambio que, cuando y de que valor a cual. Del mas reciente al mas antiguo.
router.get(
  "/history",
  [
    query("limit").optional().isInt({ min: 1, max: HISTORY_PAGE_MAX }).toInt(),
    query("before").optional().isInt({ min: 1 }).toInt(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: "error", errors: errors.mapped() });
      return;
    }
    try {
      const { limit, before } = req.query as { limit?: number; before?: number };
      res.json(await listSettingChanges({ limit: limit ?? 50, before }));
    } catch (error) {
      respondWithError(error, res, "Error listing settings history");
    }
  },
);

// Varios valores a la vez: se aplican todos o ninguno.
router.patch(
  "/",
  [body("values").isObject().withMessage("values must be an object of { key: value }")],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: "error", errors: errors.mapped() });
      return;
    }
    try {
      const changes = await updateSettings(req.body.values, req.user!);
      // Cada cambio queda en el log del servicio: quien, que y de que valor a cual.
      for (const change of changes) {
        logger.info("App setting changed", { ...change, by: req.user?.email });
      }
      res.json({ data: await listSettings() });
    } catch (error) {
      respondWithError(error, res, "Error updating settings");
    }
  },
);

router.delete("/:key", [param("key").isString().isLength({ max: 64 })], async (req: AuthenticatedRequest, res: Response) => {
  try {
    await resetSetting(req.params.key, req.user!);
    logger.info("App setting reset to default", { key: req.params.key, by: req.user?.email });
    res.json({ data: await listSettings() });
  } catch (error) {
    respondWithError(error, res, "Error resetting setting");
  }
});

export default router;
