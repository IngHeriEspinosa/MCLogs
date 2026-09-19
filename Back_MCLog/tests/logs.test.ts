import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = new PrismaClient();
let accessToken: string;

const sampleLog = {
  application: "web",
  level: "info",
  environment: "development",
  message: "user logged in",
  metadata: {
    version: "1.0.0",
    userId: 123,
    userRole: "admin",
  },
};

beforeAll(async () => {
  await ensureAdminUser();
  const loginRes = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL || "admin@example.com",
    password: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  });
  accessToken = loginRes.body.accessToken;
  await prisma.log.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Logs API", () => {
  it("creates a log with JWT", async () => {
    const res = await request(app).post("/api/log").set("Authorization", `Bearer ${accessToken}`).send(sampleLog);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.application).toBe(sampleLog.application);
  });

  it("creates a log with API key (machine-to-machine, e.g. NetSuite)", async () => {
    const res = await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({ application: "netsuite", level: "error", environment: "production", message: "script failed" });
    expect(res.status).toBe(201);
    expect(res.body.application).toBe("netsuite");
  });

  it("accepts a log without metadata", async () => {
    const { metadata, ...rest } = sampleLog as any;
    const res = await request(app).post("/api/log").set("Authorization", `Bearer ${accessToken}`).send(rest);
    expect(res.status).toBe(201);
  });

  it("rejects invalid level", async () => {
    const res = await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({ ...sampleLog, level: "critical" });
    expect(res.status).toBe(400);
  });

  it("creates logs in batch", async () => {
    const logs = Array.from({ length: 5 }, (_, i) => ({
      application: "batch-app",
      level: "info",
      environment: "staging",
      message: `batch message ${i}`,
    }));
    const res = await request(app).post("/api/logs/batch").set("x-api-key", config.apiKey).send({ logs });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(5);
  });

  it("lists logs with pagination", async () => {
    const res = await request(app).get("/api/logs?page=1&pageSize=10").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it("filters by from AND to combined", async () => {
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app)
      .get(`/api/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it("supports search across message and application", async () => {
    const res = await request(app)
      .get("/api/logs?search=batch")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
  });

  it("sorts by application", async () => {
    const res = await request(app)
      .get("/api/logs?sort=application:asc")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated queries", async () => {
    const res = await request(app).get("/api/logs");
    expect(res.status).toBe(401);
  });

  it("rejects query endpoints with an ingest-only API key", async () => {
    // 403 y no 401: la clave es valida, lo que le falta es el scope "read".
    // La garantia sigue siendo la misma: una clave de ingesta jamas lee logs.
    const res = await request(app).get("/api/logs").set("x-api-key", config.apiKey);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("data");
  });

  it("returns csv when requested", async () => {
    const res = await request(app)
      .get("/api/logs?format=csv&pageSize=5")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.split("\n")[0]).toContain("id,timestamp,application");
  });

  it("returns stats", async () => {
    const res = await request(app).get("/api/logs/stats").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("byLevel");
    expect(res.body).toHaveProperty("byApplication");
  });

  it("purges old logs (admin only)", async () => {
    const before = new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
    const res = await request(app)
      .delete(`/api/logs?before=${encodeURIComponent(before)}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("deleted");
  });
});
