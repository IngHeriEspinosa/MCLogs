import express, { RequestHandler, Response } from "express";
import { body, param, validationResult } from "express-validator";
import logger from "../config/logger";
import { login, loginWithSecondFactor, refresh, logout } from "../services/authService";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  startTwoFactorSetup,
  verifySecondFactor,
} from "../services/twoFactorService";
import {
  PASSWORD_MIN_LENGTH,
  USER_ROLES,
  UserServiceError,
  assertPassword,
  changeOwnPassword,
  createUser,
  deleteOwnAccount,
  deleteUser,
  getUserById,
  listUsers,
  updateUser,
} from "../services/userService";
import { setAuthCookies, clearAuthCookies } from "../middlewares/setAuthCookies";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { loginLimiter, passwordResetLimiter } from "../middlewares/rateLimiters";
import {
  RESET_LOCALES,
  isPasswordResetAvailable,
  requestPasswordReset,
  resetPassword,
} from "../services/passwordResetService";

const router = express.Router();

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

/** Traduce los errores de negocio a su codigo HTTP; el resto es un 500. */
const respondWithError = (error: unknown, res: Response, context: string) => {
  if (error instanceof UserServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  logger.error(context, { error });
  res.status(500).json({ error: context });
};

const passwordRule = (field: string) =>
  body(field)
    .isString()
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);

// --- Sesion ---

const loginHandler: RequestHandler = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.mapped() });
    return;
  }
  const { email, password } = req.body;
  try {
    const result = await login(email, password);
    if (result.mfaRequired) {
      // Contrasena correcta, pero la sesion no se abre hasta el segundo factor.
      res.json({ mfaRequired: true, mfaToken: result.mfaToken });
      return;
    }
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.header("x-access-token", result.accessToken).header("x-refresh-token", result.refreshToken).json(result);
  } catch (err) {
    res.status(401).json({ error: "Invalid credentials" });
  }
};

const refreshHandler: RequestHandler = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.mapped() });
    return;
  }
  try {
    const token = req.body.refreshToken || (req.cookies?.refresh_token as string | undefined);
    if (!token) {
      res.status(401).json({ error: "Refresh token missing" });
      return;
    }
    const result = await refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.header("x-access-token", result.accessToken).header("x-refresh-token", result.refreshToken).json(result);
  } catch (err) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
};

// loginLimiter solo cuenta los intentos fallidos, asi que un usuario legitimo
// que entra bien nunca se autobloquea.
router.post("/login", loginLimiter, [body("email").isEmail(), body("password").isString().isLength({ min: 6 })], loginHandler);
router.post(
  "/login/2fa",
  loginLimiter,
  [body("mfaToken").isString().notEmpty(), body("code").isString().notEmpty()],
  async (req: express.Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.mapped() });
      return;
    }
    try {
      const result = await loginWithSecondFactor(req.body.mfaToken, req.body.code);
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.header("x-access-token", result.accessToken).header("x-refresh-token", result.refreshToken).json(result);
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : "Invalid verification code" });
    }
  },
);
// refreshToken es opcional en el body: puede venir en la cookie httpOnly refresh_token
router.post("/refresh", [body("refreshToken").optional().isString()], refreshHandler);
router.post("/logout", async (req, res) => {
  const token = (req.body?.refreshToken as string | undefined) || (req.cookies?.refresh_token as string | undefined);
  await logout(token);
  clearAuthCookies(res);
  res.json({ ok: true });
});

// --- Contrasena olvidada ---

router.post(
  "/password/forgot",
  passwordResetLimiter,
  [body("email").isString().trim().isEmail(), body("locale").optional().isIn(RESET_LOCALES), handleValidation],
  (req: express.Request, res: Response) => {
    if (!isPasswordResetAvailable()) {
      res.status(503).json({ error: "Password reset by email is not configured" });
      return;
    }
    // Se responde sin esperar a buscar la cuenta ni a enviar el correo: asi la
    // respuesta, y lo que tarda, son iguales exista o no ese correo.
    requestPasswordReset(req.body.email, req.body.locale ?? "es").catch((error) =>
      logger.error("Password reset email failed", { error: String(error) }),
    );
    res.json({ ok: true });
  },
);

// loginLimiter cuenta los enlaces invalidos: probar tokens a ciegas choca con el mismo tope que el login.
router.post(
  "/password/reset",
  loginLimiter,
  [body("token").isString().notEmpty(), passwordRule("password"), handleValidation],
  async (req: express.Request, res: Response) => {
    try {
      const userId = await resetPassword(req.body.token, req.body.password);
      clearAuthCookies(res);
      logger.info("Password reset by email link", { userId });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error resetting password");
    }
  },
);

// --- Cuenta propia ---

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Se relee de base de datos en lugar de confiar en el JWT: el rol puede
    // haber cambiado despues de emitirse el token.
    const user = req.user ? await getUserById(req.user.id) : null;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ data: user });
  } catch (error) {
    respondWithError(error, res, "Error retrieving current user");
  }
});

router.patch(
  "/me/password",
  requireAuth,
  [body("currentPassword").isString().notEmpty(), passwordRule("newPassword"), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await changeOwnPassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
      // Se han revocado todos los refresh tokens, incluido el de esta sesion.
      clearAuthCookies(res);
      logger.info("Password changed", { userId: req.user!.id });
      res.json({ ok: true, message: "Password updated. Sign in again." });
    } catch (error) {
      respondWithError(error, res, "Error changing password");
    }
  },
);

router.delete(
  "/me",
  requireAuth,
  loginLimiter,
  [body("password").isString().notEmpty(), body("code").optional().isString(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteOwnAccount(req.user!.id, req.body.password, (id) => verifySecondFactor(id, req.body.code));
      clearAuthCookies(res);
      logger.info("Account deleted by its owner", { userId: req.user!.id });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error deleting account");
    }
  },
);

// --- Segundo factor (TOTP) ---

router.post("/me/2fa/setup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ data: await startTwoFactorSetup(req.user!.id) });
  } catch (error) {
    respondWithError(error, res, "Error starting two-factor setup");
  }
});

router.post(
  "/me/2fa/enable",
  requireAuth,
  loginLimiter,
  [body("code").isString().notEmpty(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recoveryCodes = await confirmTwoFactorSetup(req.user!.id, req.body.code);
      logger.info("Two-factor enabled", { userId: req.user!.id });
      res.json({ data: { recoveryCodes } });
    } catch (error) {
      respondWithError(error, res, "Error enabling two-factor authentication");
    }
  },
);

router.post(
  "/me/2fa/disable",
  requireAuth,
  loginLimiter,
  [body("password").isString().notEmpty(), body("code").isString().notEmpty(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await assertPassword(req.user!.id, req.body.password);
      if (!(await verifySecondFactor(req.user!.id, req.body.code))) {
        throw new UserServiceError("Invalid verification code", 400);
      }
      await disableTwoFactor(req.user!.id);
      logger.info("Two-factor disabled", { userId: req.user!.id });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error disabling two-factor authentication");
    }
  },
);

// --- Administracion de usuarios ---

const adminOnly = [requireAuth, requireRole("admin")];

router.get("/users", adminOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ data: await listUsers() });
  } catch (error) {
    respondWithError(error, res, "Error listing users");
  }
});

router.post(
  "/users",
  adminOnly,
  [
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    passwordRule("password"),
    body("role").optional().isIn(USER_ROLES).withMessage(`role must be one of: ${USER_ROLES.join(", ")}`),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await createUser({ email: req.body.email, password: req.body.password, role: req.body.role });
      logger.info("User created", { id: user.id, email: user.email, role: user.role, by: req.user?.email });
      res.status(201).json({ data: user });
    } catch (error) {
      respondWithError(error, res, "Error creating user");
    }
  },
);

router.patch(
  "/users/:id",
  adminOnly,
  [
    param("id").isInt({ min: 1 }).toInt(),
    body("role").optional().isIn(USER_ROLES).withMessage(`role must be one of: ${USER_ROLES.join(", ")}`),
    body("password").optional().isString().isLength({ min: PASSWORD_MIN_LENGTH }),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.body.role === undefined && req.body.password === undefined) {
      res.status(400).json({ error: "Nothing to update: provide role or password" });
      return;
    }
    try {
      const user = await updateUser(Number(req.params.id), { role: req.body.role, password: req.body.password });
      logger.info("User updated", {
        id: user.id,
        roleChanged: req.body.role !== undefined,
        passwordChanged: req.body.password !== undefined,
        by: req.user?.email,
      });
      res.json({ data: user });
    } catch (error) {
      respondWithError(error, res, "Error updating user");
    }
  },
);

router.delete(
  "/users/:id",
  adminOnly,
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteUser(Number(req.params.id), req.user!.id);
      logger.info("User deleted", { id: Number(req.params.id), by: req.user?.email });
      res.json({ ok: true });
    } catch (error) {
      respondWithError(error, res, "Error deleting user");
    }
  },
);

export default router;
