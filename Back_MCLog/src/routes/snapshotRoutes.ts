import express, { RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";
import logger from "../config/logger";
import { AuthenticatedRequest, optionalAuth, requireAuth } from "../middlewares/requireAuth";
import { requireWorkspace, workspaceIdOf } from "../middlewares/workspaceContext";
import { queryLimiter } from "../middlewares/rateLimiters";
import {
  createSnapshot,
  deleteSnapshot,
  getSnapshotByToken,
  getSnapshotPreview,
  listSnapshots,
  SNAPSHOT_EXPIRY_DAYS,
  SNAPSHOT_KINDS,
  SNAPSHOT_SORT_FIELDS,
  SNAPSHOT_TITLE_MAX,
  SnapshotError,
} from "../services/snapshotService";

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

const respondWithError = (error: unknown, res: express.Response, context: string) => {
  if (error instanceof SnapshotError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  logger.error(context, { error });
  res.status(500).json({ error: context });
};

const TEXT_FILTERS = ["application", "search", "fingerprint", "service", "host", "traceId", "message", "errorName", "errorCode"];

/**
 * Gestion de snapshots del espacio activo. Cualquier miembro crea los de
 * equipo; los publicos, solo el dueño (lo comprueba el servicio).
 */
export const snapshotRouter = express.Router();

snapshotRouter.use(queryLimiter, requireAuth, requireWorkspace);

snapshotRouter.get("/", async (req, res) => {
  try {
    res.json({ data: await listSnapshots(workspaceIdOf(req)) });
  } catch (error) {
    respondWithError(error, res, "Error listing snapshots");
  }
});

snapshotRouter.post(
  "/",
  [
    body("title").isString().trim().notEmpty().withMessage("title is required").isLength({ max: SNAPSHOT_TITLE_MAX }),
    body("visibility").isIn(["workspace", "public"]).withMessage("visibility must be workspace or public"),
    body("kind").optional().isIn([...SNAPSHOT_KINDS]).withMessage(`kind must be one of: ${SNAPSHOT_KINDS.join(", ")}`),
    // Una traza sin traceId no es nada que capturar.
    body("filters.traceId")
      .if(body("kind").equals("trace"))
      .isString()
      .trim()
      .notEmpty()
      .withMessage("filters.traceId is required for a trace snapshot"),
    body("expiresInDays")
      .optional({ values: "null" })
      .isIn(SNAPSHOT_EXPIRY_DAYS.map(String))
      .withMessage(`expiresInDays must be one of ${SNAPSHOT_EXPIRY_DAYS.join(", ")} or null`)
      .toInt(),
    body("filters").optional().isObject(),
    ...TEXT_FILTERS.map((key) => body(`filters.${key}`).optional({ values: "falsy" }).isString().isLength({ max: 500 })),
    body("filters.level").optional({ values: "falsy" }).isIn(["debug", "info", "warn", "error"]),
    body("filters.environment").optional({ values: "falsy" }).isIn(["development", "staging", "production"]),
    body("filters.from").optional({ values: "falsy" }).isISO8601().toDate(),
    body("filters.to").optional({ values: "falsy" }).isISO8601().toDate(),
    body("filters.sortField").optional({ values: "falsy" }).isIn([...SNAPSHOT_SORT_FIELDS]),
    body("filters.sortDir").optional({ values: "falsy" }).isIn(["asc", "desc"]),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const filters = (req.body.filters ?? {}) as Record<string, unknown>;
      // Solo los filtros conocidos: el resto del cuerpo no llega a la base de datos.
      const known = Object.fromEntries(
        [...TEXT_FILTERS, "level", "environment", "from", "to", "sortField", "sortDir"]
          .filter((key) => filters[key] !== undefined && filters[key] !== "" && filters[key] !== null)
          .map((key) => [key, filters[key]]),
      );
      const snapshot = await createSnapshot({
        workspaceId: workspaceIdOf(req),
        userId: req.user!.id,
        role: req.workspace!.role,
        title: req.body.title,
        kind: req.body.kind ?? "logs",
        visibility: req.body.visibility,
        expiresInDays: (req.body.expiresInDays as number | undefined) ?? null,
        filters: known,
      });
      logger.info("Snapshot created", {
        id: snapshot.id,
        workspaceId: workspaceIdOf(req),
        kind: snapshot.kind,
        visibility: snapshot.visibility,
        rows: snapshot.totalMatched,
        by: req.user?.email,
      });
      res.status(201).json({ data: snapshot });
    } catch (error) {
      respondWithError(error, res, "Error creating snapshot");
    }
  },
);

snapshotRouter.delete(
  "/:id",
  [param("id").isInt({ min: 1 }).withMessage("id must be an integer").toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const deleted = await deleteSnapshot(Number(req.params.id), workspaceIdOf(req), {
        id: req.user!.id,
        role: req.workspace!.role,
      });
      if (!deleted) {
        res.status(404).json({ error: "Snapshot not found" });
        return;
      }
      logger.info("Snapshot deleted", { id: deleted.id, by: req.user?.email });
      res.status(204).end();
    } catch (error) {
      respondWithError(error, res, "Error deleting snapshot");
    }
  },
);

/**
 * Lectura de un snapshot por su enlace (`/api/share`). No depende del espacio
 * activo: el enlace ya dice de que espacio es. Sin sesion solo se abren los
 * publicos; los de equipo piden entrar y ser miembro.
 */
export const snapshotViewRouter = express.Router();

// El token se valida antes de mirar la sesion: uno mal formado no llega a
// verificar JWT ni a renovar cookies.
const validToken = [param("token").isString().isLength({ min: 20, max: 64 }).matches(/^[A-Za-z0-9_-]+$/), handleValidation];

/**
 * Vista previa para quien pega el enlace en un chat: el servidor del dashboard
 * la pide para rellenar las etiquetas Open Graph. Sin sesion y sin contar
 * visita; de los de equipo no dice nada (404).
 */
snapshotViewRouter.get("/:token/preview", queryLimiter, ...validToken, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    const preview = await getSnapshotPreview(String(req.params.token));
    if (!preview) {
      res.status(404).json({ error: "Snapshot not found" });
      return;
    }
    res.json({ data: preview });
  } catch (error) {
    respondWithError(error, res, "Error loading snapshot preview");
  }
});

snapshotViewRouter.get(
  "/:token",
  queryLimiter,
  ...validToken,
  optionalAuth,
  async (req: AuthenticatedRequest, res: express.Response) => {
    // Un enlace compartido no debe quedar en caches intermedias ni en buscadores.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    try {
      const result = await getSnapshotByToken(String(req.params.token), req.user);
      if (!result) {
        res.status(404).json({ error: "Snapshot not found" });
        return;
      }
      if ("requiresAuth" in result) {
        res.status(401).json({ error: "Sign in to view this snapshot", requiresAuth: true });
        return;
      }
      res.json({ data: result.snapshot });
    } catch (error) {
      respondWithError(error, res, "Error loading snapshot");
    }
  },
);
