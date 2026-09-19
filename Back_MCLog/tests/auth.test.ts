import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { config } from "../src/config/env";

const prisma = new PrismaClient();

let adminAccessToken: string;
let adminRefreshToken: string;
let adminUserId: number;

const loginAdmin = async () => {
  const res = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL || "admin@example.com",
    password: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  });
  adminAccessToken = res.body.accessToken;
  adminRefreshToken = res.body.refreshToken;
  adminUserId = res.body.user.id;
  return res;
};

beforeAll(async () => {
  process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  await ensureAdminUser();
  await prisma.refreshToken.deleteMany();
  await prisma.log.deleteMany();
  await loginAdmin();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Auth & Security", () => {
  it("rejects invalid credentials", async () => {
    const res = await request(app).post("/auth/login").send({ email: "wrong@example.com", password: "nope123" });
    expect(res.status).toBe(401);
  });

  it("auto-refreshes an expired access token and renews cookies", async () => {
    const shortLived = jwt.sign(
      { sub: adminUserId, email: process.env.ADMIN_EMAIL, role: "admin" },
      config.jwtAccessSecret,
      { expiresIn: "1s" }
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app)
      .get("/api/logs?page=1&pageSize=1")
      .set("Authorization", `Bearer ${shortLived}`)
      .set("x-refresh-token", adminRefreshToken);

    expect(res.status).toBe(200);
    expect(res.headers["x-access-token"]).toBeTruthy();
    expect(res.headers["x-refresh-token"]).toBeTruthy();
    expect(res.headers["set-cookie"]?.some((c: string) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("invalidates refresh token after logout", async () => {
    const logoutRes = await request(app).post("/auth/logout").send({ refreshToken: adminRefreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app).post("/auth/refresh").send({ refreshToken: adminRefreshToken });
    expect(refreshRes.status).toBe(401);

    // login again for subsequent tests
    await loginAdmin();
  });

  it("enforces API key on /metrics", async () => {
    const missing = await request(app).get("/metrics");
    expect(missing.status).toBeGreaterThanOrEqual(401);

    const ok = await request(app).get("/metrics").set("x-api-key", config.apiKey);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("nodejs_version_info");
  });

  it("rejects payloads above 3mb", async () => {
    const bigMessage = "x".repeat(3 * 1024 * 1024); // 3MB string
    const res = await request(app)
      .post("/api/log")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        application: "web",
        level: "info",
        environment: "dev",
        message: bigMessage,
        metadata: {},
      });

    expect([400, 413]).toContain(res.status);
  });
});
