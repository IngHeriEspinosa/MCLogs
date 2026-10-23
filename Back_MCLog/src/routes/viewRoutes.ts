import express, { RequestHandler, Response } from "express";
import { body, param, validationResult } from "express-validator";
import logger from "../config/logger";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { requireWorkspace, requireWorkspaceOwner, workspaceIdOf } from "../middlewares/workspaceContext";
import { queryLimiter } from "../middlewares/rateLimiters";

/**
 * Vistas guardadas del espacio: una pantalla con sus filtros. Todos los
 * miembros las ven y las usan; solo el dueno (o el admin de plataforma) las
 * crea y las borra, como el resto de la configuracion del espacio.
 */
const router = express.Router();

/** Pantallas que admiten vistas guardadas. */
export const VIEW_PATHS = ["/logs", "/records", "/errors", "/traces"] as const;

const VIEW_FIELDS = { id: true, name: true, path: true, query: true, createdAt: true } as const;

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

router.use(queryLimiter, requireAuth);

router.get("/", requireWorkspace, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const views = await prisma.savedView.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: { name: "asc" },
      select: VIEW_FIELDS,
    });
    res.json({ data: views });
  } catch (error) {
    logger.error("Error listing saved views", { error });
    res.status(500).json({ error: "Error listing saved views" });
  }
});

router.post(
  "/",
  requireWorkspaceOwner,
  [
    body("name").trim().notEmpty().isLength({ max: 120 }),
    body("path").isIn(VIEW_PATHS),
    // Solo la query string, sin esquema ni barras: nada que pueda llevar a otro sitio.
    body("query")
      .isString()
      .isLength({ max: 2000 })
      .custom((value: string) => !/[\s/\\]|^[a-z][a-z0-9+.-]*:/i.test(value))
      .withMessage("query must be a plain query string"),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const view = await prisma.savedView.create({
        data: {
          workspaceId: workspaceIdOf(req),
          name: req.body.name,
          path: req.body.path,
          query: String(req.body.query).replace(/^\?/, ""),
          createdById: req.user?.id ?? null,
        },
        select: VIEW_FIELDS,
      });
      res.status(201).json({ data: view });
    } catch (error) {
      logger.error("Error creating saved view", { error });
      res.status(500).json({ error: "Error creating saved view" });
    }
  },
);

router.delete(
  "/:id",
  requireWorkspaceOwner,
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await prisma.savedView.deleteMany({ where: { id: Number(req.params.id), workspaceId: workspaceIdOf(req) } });
    if (deleted.count === 0) {
      res.status(404).json({ error: "View not found" });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
