import bcrypt from "bcryptjs";
import jwt, { Secret } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/prisma";
import { config } from "../config/env";

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

export const ensureAdminUser = async () => {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  const existing = await prisma.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } });
  if (existing) return;
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await prisma.user.create({ data: { email: process.env.ADMIN_EMAIL, passwordHash: hash, role: "admin" } });
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

export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");
  const tokens = await issueTokens(user.id, user.email, user.role);
  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
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
