import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { createPrismaClient } from "../src/config/prisma";
import { ensureAdminUser } from "../src/services/authService";
import { getDefaultWorkspaceId } from "../src/services/workspaceService";
import { PAGERDUTY_EVENTS_URL, dedupKeyOf, pagerDutyEvent, sendPagerDuty } from "../src/alerts/notifiers/pagerduty";
import type { AlertChannel } from "@prisma/client";
import type { AlertPayload, AlertSample } from "../src/alerts/types";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
const ROUTING_KEY = "a".repeat(32);
let adminToken: string;
let workspaceId: number;

const sample = (fingerprint: string | null): AlertSample => ({
  id: 1,
  timestamp: "2026-10-29T10:00:00.000Z",
  application: "facturacion",
  service: "pagos",
  level: "error",
  message: "timeout",
  errorName: "TimeoutError",
  fingerprint,
  traceId: null,
});

const payload = (overrides: Partial<AlertPayload> = {}): AlertPayload => ({
  rule: { id: 7, name: "errores de pagos", type: "threshold" },
  kind: "trigger",
  triggeredAt: "2026-10-29T10:00:00.000Z",
  count: 12,
  windowMinutes: 10,
  threshold: 5,
  application: "facturacion",
  environment: "production",
  level: "error",
  summary: "12 errores en 10 min (umbral 5)",
  samples: [sample("abc")],
  dashboardUrl: "https://mclog.test/logs?level=error",
  ...overrides,
});

/** Evento de disparo, que es el que lleva `payload`. */
const triggerOf = (alert: AlertPayload) => {
  const event = pagerDutyEvent(alert, ROUTING_KEY);
  if (!("payload" in event)) throw new Error("se esperaba un evento trigger");
  return event;
};

beforeAll(async () => {
  await ensureAdminUser();
  workspaceId = (await getDefaultWorkspaceId())!;
  const login = await request(app).post("/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  adminToken = login.body.accessToken;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.alertChannel.deleteMany({ where: { workspaceId, name: { startsWith: "pd-test" } } });
  await prisma.$disconnect();
});

describe("Evento de PagerDuty", () => {
  it("un disparo lleva resumen, severidad, enlace y detalles", () => {
    const event = triggerOf(payload());
    expect(event).toMatchObject({
      routing_key: ROUTING_KEY,
      event_action: "trigger",
      dedup_key: "mclog:rule:7",
      client: "MCLog",
      client_url: "https://mclog.test/logs?level=error",
      links: [{ href: "https://mclog.test/logs?level=error", text: "Ver en MCLog" }],
      payload: { source: "facturacion", severity: "error", class: "threshold", group: "production", component: "pagos" },
    });
    expect(event.payload.summary).toContain("12 errores en 10 min");
  });

  it("la recuperacion cierra el mismo incidente que abrio el disparo", () => {
    const resolve = pagerDutyEvent(payload({ kind: "resolve" }), ROUTING_KEY);
    expect(resolve).toEqual({ routing_key: ROUTING_KEY, event_action: "resolve", dedup_key: "mclog:rule:7" });
  });

  it("un fallo nuevo unico es su propio incidente; varios comparten el de la regla", () => {
    const single = payload({ rule: { id: 3, name: "nuevos", type: "new_error_group" }, samples: [sample("f1")] });
    expect(dedupKeyOf(single)).toBe("mclog:rule:3:f1");
    const several = payload({ rule: { id: 3, name: "nuevos", type: "new_error_group" }, samples: [sample("f1"), sample("f2")] });
    expect(dedupKeyOf(several)).toBe("mclog:rule:3");
  });

  it("el silencio es serio aunque la regla vigile logs de info", () => {
    const event = triggerOf(payload({ rule: { id: 9, name: "latido", type: "silence" }, level: "info" }));
    expect(event.payload.severity).toBe("error");
  });

  it("envia a Events API v2 y un rechazo se convierte en error", async () => {
    const fetchMock = vi.fn(async () => new Response('{"status":"invalid event"}', { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const channel: AlertChannel = {
      id: 1,
      workspaceId,
      name: "pd",
      type: "pagerduty",
      config: { routingKey: ROUTING_KEY },
      enabled: true,
      createdAt: new Date(),
    };
    await expect(sendPagerDuty(channel, payload())).rejects.toThrow(/PagerDuty HTTP 400/);
    expect(fetchMock).toHaveBeenCalledWith(PAGERDUTY_EVENTS_URL, expect.objectContaining({ method: "POST" }));
  });
});

describe("Canal PagerDuty en la API", () => {
  it("exige una routing key y la devuelve enmascarada", async () => {
    const sinClave = await request(app)
      .post("/api/alerts/channels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "pd-test sin clave", type: "pagerduty", config: { routingKey: "corta" } });
    expect(sinClave.status).toBe(400);

    const creado = await request(app)
      .post("/api/alerts/channels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "pd-test", type: "pagerduty", config: { routingKey: ROUTING_KEY } });
    expect(creado.status).toBe(201);
    expect(creado.body.data.config.routingKey).toBe("aaaa********");

    // Editar el nombre con la mascara no borra la clave guardada.
    const editado = await request(app)
      .patch(`/api/alerts/channels/${creado.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "pd-test renombrado", config: { routingKey: "aaaa********" } });
    expect(editado.status).toBe(200);
    const guardado = await prisma.alertChannel.findUnique({ where: { id: creado.body.data.id } });
    expect((guardado?.config as { routingKey: string }).routingKey).toBe(ROUTING_KEY);
  });
});
