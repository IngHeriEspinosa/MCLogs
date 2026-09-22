import bcrypt from "bcryptjs";
import jwt, { Secret } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/prisma";
import { config } from "../config/env";
import { verifySecondFactor } from "./twoFactorService";

const parseDurationMs = (value: string) => {
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 0;
  const num = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * (multipliers[unit] || 0);
};

const accessTtl = (config.jwtAccessTtl || "7d") as jwt.SignOptions["expiresIn"];
const refreshTtl = (config.jwtRefreshTtl || "14d") as jwt.SignOptions["expiresIn"];
const refreshTtlMs = parseDurationMs(String(refreshTtl));

/**
 * Da de alta la cuenta root (ADMIN_EMAIL) si no existe y la marca como tal.
 * Solo hay un root: si ADMIN_EMAIL cambia, la cuenta anterior pasa a ser un
 * admin normal.
 */
export const ensureAdminUser = async () => {
  const email = process.env.ADMIN_EMAIL;
  if (!email || !process.env.ADMIN_PASSWORD) return;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isRoot || existing.role !== "admin") {
      await prisma.user.update({ where: { id: existing.id }, data: { isRoot: true, role: "admin" } });
    }
  } else {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await prisma.user.create({ data: { email, passwordHash: hash, role: "admin", isRoot: true } });
  }
  await prisma.user.updateMany({ where: { isRoot: true, email: { not: email } }, data: { isRoot: false } });
};

const issueTokens = async (userId: number, email: string, role: string) => {
  const accessToken = jwt.sign({ sub: userId, email, role }, config.jwtAccessSecret as Secret, { expiresIn: accessTtl });
  const jti = uuidv4();
  const refreshToken = jwt.sign({ sub: userId, jti }, config.jwtRefreshSecret as Secret, { expiresIn: refreshTtl });
  if (refreshTtlMs > 0) {
    await prisma.refreshToken.create({
      data: {
        token: jti,
        userId,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });
  }
  return { accessToken, refreshToken };
};

/**
 * Token intermedio entre la contrasena y el segundo factor. Se firma con un
 * secreto derivado y una audiencia propia para que requireAuth no lo acepte
 * nunca como access token.
 */
const MFA_TTL = "5m";
const MFA_AUDIENCE = "mclog-mfa";
const mfaSecret = () => `${config.jwtAccessSecret}:mfa`;

export type LoginResult =
  | { mfaRequired: true; mfaToken: string }
  | { mfaRequired?: false; user: { id: number; email: string; role: string }; accessToken: string; refreshToken: string };

const completeLogin = async (user: { id: number; email: string; role: string }) => {
  const tokens = await issueTokens(user.id, user.email, user.role);
  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
};

export const login = async (email: string, password: string): Promise<LoginResult> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");
  if (user.twoFactorEnabled) {
    const mfaToken = jwt.sign({ sub: user.id }, mfaSecret(), { expiresIn: MFA_TTL, audience: MFA_AUDIENCE });
    return { mfaRequired: true, mfaToken };
  }
  return completeLogin(user);
};

/** Segundo paso del login: el token intermedio mas un codigo TOTP o de recuperacion. */
export const loginWithSecondFactor = async (mfaToken: string, code: string) => {
  let userId: number;
  try {
    const payload = jwt.verify(mfaToken, mfaSecret(), { audience: MFA_AUDIENCE }) as jwt.JwtPayload;
    userId = Number(payload.sub);
  } catch {
    throw new Error("Invalid or expired sign-in attempt");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorEnabled) throw new Error("Invalid or expired sign-in attempt");
  if (!(await verifySecondFactor(user.id, code))) throw new Error("Invalid verification code");
  return completeLogin(user);
};

export const refresh = async (refreshToken: string) => {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret as Secret) as jwt.JwtPayload & { jti?: string };
    if (!payload.sub || !payload.jti) throw new Error("Invalid refresh token");
    const tokenRecord = await prisma.refreshToken.findUnique({ where: { token: payload.jti } });
    if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
      throw new Error("Refresh token expired");
    }
    // rotate token
    await prisma.refreshToken.delete({ where: { token: payload.jti } });
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) throw new Error("User not found");
    const tokens = await issueTokens(user.id, user.email, user.role);
    return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
  } catch (err) {
    throw new Error("Invalid refresh token");
  }
};

export const parseAccessToken = (token: string) => {
  return jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;
};

export const logout = async (refreshToken?: string) => {
  if (!refreshToken) return;
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret as Secret) as jwt.JwtPayload & { jti?: string };
    if (payload?.jti) {
      await prisma.refreshToken.deleteMany({ where: { token: payload.jti } });
    }
  } catch {
    // ignore invalid tokens on logout
  }
};
