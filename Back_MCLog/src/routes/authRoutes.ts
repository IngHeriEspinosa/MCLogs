import express, { RequestHandler } from "express";
import { body } from "express-validator";
import { login, refresh } from "../services/authService";
import { validationResult } from "express-validator";
import { setAuthCookies, clearAuthCookies } from "../middlewares/setAuthCookies";
import { logout } from "../services/authService";

const router = express.Router();

const loginHandler: RequestHandler = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.mapped() });
    return;
  }
  const { email, password } = req.body;
  try {
    const result = await login(email, password);
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

router.post("/login", [body("email").isEmail(), body("password").isString().isLength({ min: 6 })], loginHandler);
// refreshToken es opcional en el body: puede venir en la cookie httpOnly refresh_token
router.post("/refresh", [body("refreshToken").optional().isString()], refreshHandler);
router.post("/logout", async (req, res) => {
  const token = (req.body?.refreshToken as string | undefined) || (req.cookies?.refresh_token as string | undefined);
  await logout(token);
  clearAuthCookies(res);
  res.json({ ok: true });
});

export default router;
