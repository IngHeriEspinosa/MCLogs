import express, { NextFunction, RequestHandler, Response } from "express";
import { body, param, validationResult } from "express-validator";
import logger from "../config/logger";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { queryLimiter } from "../middlewares/rateLimiters";
import { RESET_LOCALES } from "../services/passwordResetService";
import { UserServiceError } from "../services/userService";
import {
  WORKSPACE_NAME_MAX,
  WORKSPACE_ROLES,
  addMember,
  assertCanCreateWorkspace,
  createWorkspace,
  deleteWorkspace,
  getMembershipRole,
  listMembers,
  listUserWorkspaces,
  removeMember,
  renameWorkspace,
  resendInvitation,
  updateMemberRole,
} from "../services/workspaceService";

/**
 * Espacios de trabajo y sus miembros.
 *
 * Solo con sesion de usuario: una API key vive dentro de un espacio y no puede
 * crear ni administrar ninguno. El espacio va en la ruta (`/:id`) y se
 * comprueba que quien pide sea miembro, o dueño para lo que administra.
 */
const router = express.Router();

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

const respondWithError = (error: unknown, res: Response, context: string) => {
  if (error instanceof UserServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  logger.error(context, { error });
  res.status(500).json({ error: context });
};

/**
 * Carga el espacio de `:id` en `req.workspace`. Quien no es miembro recibe 404,
 * igual que si no existiera; con `ownerOnly`, un miembro recibe 403.
 */
const workspaceFromParam =
  (ownerOnly: boolean) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid workspace id" });
      return;
    }
    void (async () => {
      const role = await getMembershipRole(req.user!.id, id);
      if (!role) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      if (ownerOnly && role !== "owner") {
        res.status(403).json({ error: "Requires workspace owner" });
        return;
      }
      req.workspace = { id, role };
      next();
    })().catch(next);
  };

const asMember = workspaceFromParam(false);
const asOwner = workspaceFromParam(true);

const nameRule = body("name").isString().trim().isLength({ min: 1, max: WORKSPACE_NAME_MAX });
const userIdRule = param("userId").isInt({ min: 1 }).toInt();
const localeRule = body("locale").optional().isIn(RESET_LOCALES);

router.use(queryLimiter, requireAuth);

// --- Espacios ---

router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ data: await listUserWorkspaces(req.user!.id) });
  } catch (error) {
    respondWithError(error, res, "Error listing workspaces");
  }
});

// Quien crea un espacio queda como su dueño. La configuracion decide si puede
// cualquiera y cuantos (los admins de plataforma no tienen limite).
router.post("/", [nameRule, handleValidation], async (req: AuthenticatedRequest, res: Response) => {
  try {
    await assertCanCreateWorkspace(req.user!);
    const workspace = await createWorkspace(req.user!.id, req.body.name, req.user!.email);
    logger.info("Workspace created", { id: workspace.id, by: req.user?.email });
    res.status(201).json({ data: { id: workspace.id, name: workspace.name, role: "owner", memberCount: 1, createdAt: workspace.createdAt } });
  } catch (error) {
    respondWithError(error, res, "Error creating workspace");
  }
});

router.patch("/:id", asOwner, [nameRule, handleValidation], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspace = await renameWorkspace(req.workspace!.id, req.body.name);
    res.json({ data: { id: workspace.id, name: workspace.name } });
  } catch (error) {
    respondWithError(error, res, "Error renaming workspace");
  }
});

// Borrar exige escribir el nombre: es irreversible y arrastra todos sus logs.
router.delete(
  "/:id",
  asOwner,
  [body("confirmName").isString().notEmpty(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteWorkspace(req.workspace!.id, req.body.confirmName);
      logger.info("Workspace deleted", { id: req.workspace!.id, by: req.user?.email });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error deleting workspace");
    }
  },
);

// --- Miembros (administracion: solo el dueño) ---

router.get("/:id/members", asOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ data: await listMembers(req.workspace!.id) });
  } catch (error) {
    respondWithError(error, res, "Error listing members");
  }
});

router.post(
  "/:id/members",
  asOwner,
  [
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    body("role").optional().isIn(WORKSPACE_ROLES),
    localeRule,
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await addMember(req.workspace!.id, req.body.email, req.body.role ?? "member", req.body.locale);
      logger.info("Workspace member added", {
        workspaceId: req.workspace!.id,
        userId: result.member.userId,
        role: result.member.role,
        created: result.created,
        emailSent: result.emailSent,
        by: req.user?.email,
      });
      res.status(201).json({ data: result });
    } catch (error) {
      respondWithError(error, res, "Error adding member");
    }
  },
);

router.post(
  "/:id/members/:userId/resend",
  asOwner,
  [userIdRule, localeRule, handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json({ data: await resendInvitation(req.workspace!.id, Number(req.params.userId), req.body.locale) });
    } catch (error) {
      respondWithError(error, res, "Error resending invitation");
    }
  },
);

router.patch(
  "/:id/members/:userId",
  asOwner,
  [userIdRule, body("role").isIn(WORKSPACE_ROLES), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const member = await updateMemberRole(req.workspace!.id, Number(req.params.userId), req.body.role);
      logger.info("Workspace member role changed", {
        workspaceId: req.workspace!.id,
        userId: member.userId,
        role: member.role,
        by: req.user?.email,
      });
      res.json({ data: member });
    } catch (error) {
      respondWithError(error, res, "Error updating member");
    }
  },
);

// El dueño quita a cualquiera; un miembro solo puede salir el mismo.
router.delete(
  "/:id/members/:userId",
  asMember,
  [userIdRule, handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = Number(req.params.userId);
    if (req.workspace!.role !== "owner" && userId !== req.user!.id) {
      res.status(403).json({ error: "Requires workspace owner" });
      return;
    }
    try {
      await removeMember(req.workspace!.id, userId);
      logger.info("Workspace member removed", { workspaceId: req.workspace!.id, userId, by: req.user?.email });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error removing member");
    }
  },
);

export default router;
