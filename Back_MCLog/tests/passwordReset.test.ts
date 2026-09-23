import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import request from "supertest";

// El correo no sale de verdad: se captura lo que se habria enviado.
const mail = vi.hoisted(() => ({
  configured: true,
  sent: [] as Array<{ to: string; subject: string; text: string; html: string }>,
}));
vi.mock("../src/config/mailer", () => ({
  isMailConfigured: () => mail.configured,
  sendMail: async (message: { to: string; subject: string; text: string; html: string }) => {
    mail.sent.push(message);
  },
}));

import { config } from "../src/config/env";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { requestPasswordReset } from "../src/services/passwordResetService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
const EMAIL = "olvidadiza@example.com";
const PASSWORD = "ContrasenaLarga1";
const NEW_PASSWORD = "OtraContrasena2";
const DASHBOARD = "https://mclog.test";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const tokenFrom = (text: string) => {
  const match = text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No hay enlace en el correo:\n${text}`);
  return match[1];
};

let userId: number;
const previousDashboard = config.publicDashboardUrl;

beforeAll(async () => {
  config.publicDashboardUrl = DASHBOARD;
  await ensureAdminUser();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const admin = await request(app)
    .post("/auth/login")
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const created = await request(app)
    .post("/auth/users")
    .set({ Authorization: `Bearer ${admin.body.accessToken}` })
    .send({ email: EMAIL, password: PASSWORD });
  expect(created.status).toBe(201);
  userId = created.body.data.id;
});

beforeEach(async () => {
  mail.configured = true;
  mail.sent.length = 0;
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
});

afterAll(async () => {
  config.publicDashboardUrl = previousDashboard;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("Contraseña olvidada", () => {
  it("responde igual exista o no la cuenta, y solo envía correo si existe", async () => {
    const unknown = await request(app).post("/auth/password/forgot").send({ email: "nadie@example.com" });
    const known = await request(app).post("/auth/password/forgot").send({ email: EMAIL.toUpperCase(), locale: "en" });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    const [message] = mail.sent;
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toMatch(/reset/i);
    expect(message.text).toContain(`${DASHBOARD}/reset-password?token=`);

    // En base de datos queda el hash, nunca el token del enlace.
    const token = tokenFrom(message.text);
    const stored = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(sha256(token));
    expect(stored[0].tokenHash).not.toBe(token);
  });

  it("no envía más de un correo por minuto a la misma cuenta", async () => {
    await requestPasswordReset(EMAIL, "es");
    await requestPasswordReset(EMAIL, "es");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("Restablece tu contraseña de MCLog");
  });

  it("pedir otro enlace invalida el anterior", async () => {
    await requestPasswordReset(EMAIL, "es");
    const first = tokenFrom(mail.sent[0].text);
    // Se simula que ya paso el minuto de espera entre correos.
    await prisma.passwordResetToken.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await requestPasswordReset(EMAIL, "es");
    const second = tokenFrom(mail.sent[1].text);

    const stale = await request(app).post("/auth/password/reset").send({ token: first, password: NEW_PASSWORD });
    expect(stale.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId, tokenHash: sha256(second) } })).toBe(1);
  });

  it("cambia la contraseña, cierra las sesiones y el enlace no sirve dos veces", async () => {
    const session = await request(app).post("/auth/login").send({ email: EMAIL, password: PASSWORD });
    expect(session.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId } })).toBeGreaterThan(0);

    await requestPasswordReset(EMAIL, "es");
    const token = tokenFrom(mail.sent[0].text);

    const reset = await request(app).post("/auth/password/reset").send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);

    expect((await request(app).post("/auth/login").send({ email: EMAIL, password: PASSWORD })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: EMAIL, password: NEW_PASSWORD })).status).toBe(200);

    const again = await request(app).post("/auth/password/reset").send({ token, password: "TerceraClave3" });
    expect(again.status).toBe(400);
  });

  it("rechaza un enlace caducado y una contraseña corta", async () => {
    await requestPasswordReset(EMAIL, "es");
    const token = tokenFrom(mail.sent[0].text);

    const short = await request(app).post("/auth/password/reset").send({ token, password: "corta" });
    expect(short.status).toBe(400);

    await prisma.passwordResetToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).post("/auth/password/reset").send({ token, password: NEW_PASSWORD });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/i);
  });

  it("sin SMTP responde 503 en lugar de fingir que envió algo", async () => {
    mail.configured = false;
    const res = await request(app).post("/auth/password/forgot").send({ email: EMAIL });
    expect(res.status).toBe(503);
    expect(mail.sent).toHaveLength(0);
  });
});
