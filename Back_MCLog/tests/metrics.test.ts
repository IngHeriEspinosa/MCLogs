import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { createPrismaClient } from "../src/config/prisma";
import { config } from "../src/config/env";
import { MAX_APPLICATION_LABELS, OTHER_APPLICATION, applicationLabel } from "../src/config/metrics";

const prisma = createPrismaClient();

afterAll(async () => {
  await prisma.log.deleteMany({ where: { application: { startsWith: "metrics-test" } } });
  await prisma.$disconnect();
});

describe("Etiqueta application acotada", () => {
  it("las primeras conservan su nombre y, pasado el tope, cuentan como otras", () => {
    const names = Array.from({ length: MAX_APPLICATION_LABELS + 5 }, (_, i) => `metrics-label-${i}`);
    const labels = names.map(applicationLabel);
    // Pueden quedar menos huecos que el tope si otros tests ya etiquetaron aplicaciones.
    expect(labels.filter((label) => label === OTHER_APPLICATION).length).toBeGreaterThanOrEqual(5);
    // Una aplicacion ya etiquetada sigue con su nombre.
    expect(applicationLabel(labels[0]!)).toBe(labels[0]);
  });
});

describe("Metricas de /metrics", () => {
  it("expone el retraso de ingesta y los logs rechazados", async () => {
    await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({
        application: "metrics-test",
        level: "info",
        environment: "development",
        message: "llega tarde",
        timestamp: new Date(Date.now() - 90_000).toISOString(),
      })
      .expect(201);
    await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", config.apiKey)
      .send({ logs: [{ application: "metrics-test", level: "nivel-inventado", environment: "development", message: "x" }, { message: "y" }] })
      .expect(400);

    const res = await request(app).get("/metrics").set("x-api-key", config.apiKey);
    expect(res.status).toBe(200);
    // El log de hace 90 s cae por encima del cubo de 60 s.
    expect(res.text).toMatch(/mclog_ingest_lag_seconds_count \d+/);
    expect(res.text).toMatch(/mclog_logs_rejected_total\{reason="validation"\} ([2-9]|\d{2,})/);
    expect(res.text).toContain("mclog_alert_evaluations_total");
    expect(res.text).toContain("mclog_alert_deliveries_total");
    expect(res.text).toContain("mclog_scheduler_job_duration_seconds");
  });
});
