import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = new PrismaClient();
let adminToken: string;

beforeAll(async () => {
  await ensureAdminUser();
  const login = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Health check", () => {
  it("informa de la version, el tiempo en marcha y el estado de la base", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("up");
    expect(res.body.version).toBeTruthy();
    expect(res.body.version).not.toBe("unknown");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });
});

describe("Especificacion OpenAPI", () => {
  it("se sirve en crudo para generar clientes", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(Object.keys(res.body.paths)).toContain("/api/log");
  });
});

describe("Limites de consulta", () => {
  it("rechaza un pageSize por encima del tope real del controlador", async () => {
    // Antes el validador admitia hasta 500 y el controlador recortaba a 200 en
    // silencio: el cliente creia recibir 500 registros y recibia 200.
    const res = await request(app).get("/api/logs?pageSize=201").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("acepta el tope exacto", async () => {
    const res = await request(app).get("/api/logs?pageSize=200").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(200);
  });
});

describe("Metricas Prometheus", () => {
  it("publica la duracion de las peticiones y los logs ingeridos", async () => {
    await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({
        application: "metricas",
        level: "warn",
        environment: "development",
        message: "para el contador",
      });

    const res = await request(app).get("/metrics").set("x-api-key", config.apiKey);
    expect(res.status).toBe(200);
    expect(res.text).toContain("http_request_duration_seconds");
    expect(res.text).toContain("mclog_logs_ingested_total");
    expect(res.text).toMatch(/mclog_logs_ingested_total\{application="metricas",level="warn"\}/);
  });

  it("etiqueta las rutas por su patron y no por la URL concreta", async () => {
    const creado = await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({ application: "metricas", level: "info", environment: "development", message: "detalle" });
    await request(app).get(`/api/logs/${creado.body.id}`).set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app).get("/metrics").set("x-api-key", config.apiKey);
    // Con la URL en crudo, cada id generaria una serie temporal nueva.
    expect(res.text).toContain('route="/api/logs/:id"');
    expect(res.text).not.toContain(`route="/api/logs/${creado.body.id}"`);
  });
});
