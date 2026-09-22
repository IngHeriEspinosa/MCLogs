import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { base32Encode, currentStep, totpAt, verifyTotp } from "../src/utils/totp";
import { encodeQr } from "../src/utils/qrCode";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
const PASSWORD = "ContrasenaLarga1";
const EMAILS = ["dosfactores@example.com", "borrable@example.com", "otro.admin@example.com"];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const loginAs = async (email: string, password: string) => {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body as { accessToken?: string; mfaRequired?: boolean; mfaToken?: string };
};

let adminToken: string;

const createUser = async (email: string, role = "user") => {
  const res = await request(app).post("/auth/users").set(auth(adminToken)).send({ email, password: PASSWORD, role });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
};

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  adminToken = (await loginAs(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)).accessToken!;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

describe("TOTP", () => {
  it("cumple el vector de prueba de la RFC 6238 (SHA1, t=59)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    // 94287082 con 8 digitos; con 6 son los ultimos seis.
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
  });

  it("acepta el paso anterior y el siguiente, pero no uno ya usado", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), null, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
  });
});

describe("QR", () => {
  it("elige la version por longitud y dibuja los tres localizadores", () => {
    expect(encodeQr("HELLO").length).toBe(21);
    const matrix = encodeQr("otpauth://totp/MCLog%3Aalguien%40example.com?secret=" + "A".repeat(32) + "&issuer=MCLog");
    const size = matrix.length;
    expect((size - 17) % 4).toBe(0);
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]) {
      // Anillo exterior oscuro, anillo claro, centro 3x3 oscuro.
      expect(matrix[y][x]).toBe(true);
      expect(matrix[y + 1][x + 1]).toBe(false);
      expect(matrix[y + 3][x + 3]).toBe(true);
    }
  });
});

describe("Autenticacion en dos pasos", () => {
  let token: string;
  let secret: string;
  let recoveryCodes: string[];

  beforeAll(async () => {
    await createUser("dosfactores@example.com");
    token = (await loginAs("dosfactores@example.com", PASSWORD)).accessToken!;
  });

  it("no se activa sin un codigo valido", async () => {
    const setup = await request(app).post("/auth/me/2fa/setup").set(auth(token));
    expect(setup.status).toBe(200);
    expect(setup.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.data.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    secret = setup.body.data.secret;

    const wrong = await request(app).post("/auth/me/2fa/enable").set(auth(token)).send({ code: "000000" });
    expect(wrong.status).toBe(400);

    const me = await request(app).get("/auth/me").set(auth(token));
    expect(me.body.data.twoFactorEnabled).toBe(false);
  });

  it("se activa con el codigo de la app y devuelve codigos de recuperacion", async () => {
    const res = await request(app)
      .post("/auth/me/2fa/enable")
      .set(auth(token))
      .send({ code: totpAt(secret, currentStep()) });
    expect(res.status).toBe(200);
    recoveryCodes = res.body.data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(8);

    const me = await request(app).get("/auth/me").set(auth(token));
    expect(me.body.data.twoFactorEnabled).toBe(true);
    expect(me.body.data).not.toHaveProperty("twoFactorSecret");
  });

  it("el login pide el segundo factor y no abre sesion solo con la contrasena", async () => {
    const first = await loginAs("dosfactores@example.com", PASSWORD);
    expect(first.mfaRequired).toBe(true);
    expect(first.accessToken).toBeUndefined();

    // El token intermedio no sirve como access token.
    const blocked = await request(app).get("/auth/me").set(auth(first.mfaToken!));
    expect(blocked.status).toBe(401);

    const code = totpAt(secret, currentStep() + 1);
    const second = await request(app).post("/auth/login/2fa").send({ mfaToken: first.mfaToken, code });
    expect(second.status).toBe(200);
    expect(second.body.accessToken).toBeTruthy();

    // El mismo codigo no vale dos veces.
    const replay = await request(app).post("/auth/login/2fa").send({ mfaToken: first.mfaToken, code });
    expect(replay.status).toBe(401);
  });

  it("un codigo de recuperacion vale una sola vez", async () => {
    const { mfaToken } = await loginAs("dosfactores@example.com", PASSWORD);
    const ok = await request(app).post("/auth/login/2fa").send({ mfaToken, code: recoveryCodes[0].toUpperCase() });
    expect(ok.status).toBe(200);
    const again = await request(app).post("/auth/login/2fa").send({ mfaToken, code: recoveryCodes[0] });
    expect(again.status).toBe(401);
  });

  it("se desactiva con contrasena y codigo", async () => {
    const res = await request(app)
      .post("/auth/me/2fa/disable")
      .set(auth(token))
      .send({ password: PASSWORD, code: recoveryCodes[1] });
    expect(res.status).toBe(200);
    const login = await loginAs("dosfactores@example.com", PASSWORD);
    expect(login.accessToken).toBeTruthy();
  });
});

describe("Eliminar la propia cuenta", () => {
  it("exige la contrasena y borra la cuenta", async () => {
    await createUser("borrable@example.com");
    const token = (await loginAs("borrable@example.com", PASSWORD)).accessToken!;

    const wrong = await request(app).delete("/auth/me").set(auth(token)).send({ password: "otra-cosa-1234" });
    expect(wrong.status).toBe(400);

    const res = await request(app).delete("/auth/me").set(auth(token)).send({ password: PASSWORD });
    expect(res.status).toBe(200);

    const login = await request(app).post("/auth/login").send({ email: "borrable@example.com", password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it("la cuenta root no se puede borrar, ni por si misma ni por otro admin", async () => {
    const own = await request(app)
      .delete("/auth/me")
      .set(auth(adminToken))
      .send({ password: process.env.ADMIN_PASSWORD });
    expect(own.status).toBe(403);

    const me = await request(app).get("/auth/me").set(auth(adminToken));
    expect(me.body.data.isRoot).toBe(true);

    await createUser("otro.admin@example.com", "admin");
    const otherToken = (await loginAs("otro.admin@example.com", PASSWORD)).accessToken!;
    const byOther = await request(app).delete(`/auth/users/${me.body.data.id}`).set(auth(otherToken));
    expect(byOther.status).toBe(403);
  });
});
