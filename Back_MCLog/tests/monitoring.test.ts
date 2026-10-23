import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { getDefaultWorkspaceId } from "../src/services/workspaceService";
import { createApiKey } from "../src/services/apiKeyService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
let token: string;
let workspaceId: number;
let readKey: string;

const auth = () => ({ Authorization: `Bearer ${token}` });
const ingest = (payload: Record<string, unknown>) =>
  request(app).post("/api/log").set("x-api-key", config.apiKey).send(payload);
const failure = (overrides: Record<string, unknown> = {}) => ({
  application: "ciclo",
  service: "cobros",
  level: "error",
  environment: "production",
  message: "Pasarela caida",
  fingerprint: "ciclo-1",
  ...overrides,
});
const group = (fingerprint = "ciclo-1") => prisma.errorGroup.findUniqueOrThrow({ where: { workspaceId_fingerprint: { workspaceId, fingerprint } } });

beforeAll(async () => {
  await ensureAdminUser();
  workspaceId = (await getDefaultWorkspaceId())!;
  const login = await request(app).post("/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  token = login.body.accessToken;
  readKey = (await createApiKey({ workspaceId, name: "monitoreo lectura", scopes: ["read"] })).key;
});

beforeEach(async () => {
  await prisma.log.deleteMany();
  await prisma.errorGroup.deleteMany();
  await prisma.savedView.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ciclo de vida de los fallos", () => {
  it("la ingesta crea el grupo y lo mantiene al dia, tambien en lote", async () => {
    const hace2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    await ingest(failure({ timestamp: hace2h, release: "1.0.0" }));
    await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", config.apiKey)
      .send({ logs: [failure({ release: "1.1.0" }), failure({ release: "1.1.0" }), failure({ fingerprint: "ciclo-2" })] });

    const first = await group();
    expect(first).toMatchObject({ totalCount: 3, status: "active", firstRelease: "1.0.0", lastRelease: "1.1.0", application: "ciclo" });
    expect(Date.now() - first.firstSeen.getTime()).toBeGreaterThan(3600 * 1000);
    expect((await group("ciclo-2")).totalCount).toBe(1);
  });

  it("un fallo resuelto que vuelve cuenta una regresion; uno atrasado no lo reabre", async () => {
    await ingest(failure());
    const resolve = await request(app).patch("/api/logs/errors/groups").set(auth()).send({ fingerprints: ["ciclo-1"], status: "resolved" });
    expect(resolve.body.updated).toBe(1);
    expect((await group()).resolvedAt).not.toBeNull();

    // Una ocurrencia de antes de la resolucion, enviada tarde: sigue resuelto.
    await ingest(failure({ timestamp: new Date(Date.now() - 3600 * 1000).toISOString() }));
    expect((await group()).status).toBe("resolved");

    await ingest(failure());
    const regressed = await group();
    expect(regressed).toMatchObject({ status: "active", regressionCount: 1 });
    expect(regressed.lastRegressedAt).not.toBeNull();
  });

  it("un ignorado hasta una fecha pasada vuelve a activo al repetirse", async () => {
    await ingest(failure());
    await request(app)
      .patch("/api/logs/errors/groups")
      .set(auth())
      .send({ fingerprints: ["ciclo-1"], status: "ignored", ignoredUntil: new Date(Date.now() - 1000).toISOString() });
    await ingest(failure());
    expect(await group()).toMatchObject({ status: "active", ignoredUntil: null });
  });

  it("cambiar el estado exige la sesion del dueno: una API key no puede", async () => {
    await ingest(failure());
    const res = await request(app).patch("/api/logs/errors/groups").set("x-api-key", readKey).send({ fingerprints: ["ciclo-1"], status: "resolved" });
    expect([401, 403]).toContain(res.status);
    expect((await group()).status).toBe("active");
  });

  it("rechaza un cambio vacio o un estado desconocido", async () => {
    await ingest(failure());
    expect((await request(app).patch("/api/logs/errors/groups").set(auth()).send({ fingerprints: ["ciclo-1"] })).status).toBe(400);
    expect((await request(app).patch("/api/logs/errors/groups").set(auth()).send({ fingerprints: ["ciclo-1"], status: "borrado" })).status).toBe(400);
  });
});

describe("Vista de errores con ciclo de vida", () => {
  it("une el estado, filtra por el y devuelve la serie y el resumen de la ventana", async () => {
    await ingest(failure());
    await ingest(failure({ fingerprint: "ciclo-2", message: "Otro" }));
    await request(app).patch("/api/logs/errors/groups").set(auth()).send({ fingerprints: ["ciclo-2"], status: "resolved" });

    const all = await request(app).get("/api/logs/errors/groups?application=ciclo&series=true").set(auth());
    expect(all.status).toBe(200);
    const byFingerprint = Object.fromEntries(all.body.data.map((row: { fingerprint: string }) => [row.fingerprint, row]));
    expect(byFingerprint["ciclo-1"]).toMatchObject({ status: "active", totalCount: 1, regressionCount: 0 });
    expect(byFingerprint["ciclo-2"].status).toBe("resolved");
    expect(byFingerprint["ciclo-1"].series).toHaveLength(24);
    expect(byFingerprint["ciclo-1"].series.reduce((sum: number, value: number) => sum + value, 0)).toBe(1);
    expect(all.body.lifecycle).toMatchObject({ newInWindow: 2, resolvedInWindow: 1 });
    expect(all.body.lifecycle.mttrMs).toBeGreaterThanOrEqual(0);

    const resolved = await request(app).get("/api/logs/errors/groups?application=ciclo&status=resolved").set(auth());
    expect(resolved.body.data.map((row: { fingerprint: string }) => row.fingerprint)).toEqual(["ciclo-2"]);
  });
});

describe("Latencia y releases", () => {
  it("calcula percentiles por servicio con los logs que traen durationMs", async () => {
    for (const durationMs of [100, 200, 300, 400, 1000]) {
      await ingest({ application: "lento", service: "api", level: "info", environment: "production", message: "peticion", durationMs });
    }
    await ingest({ application: "lento", service: "api", level: "info", environment: "production", message: "sin duracion" });

    const res = await request(app).get("/api/logs/latency?application=lento").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ application: "lento", service: "api", count: 5, p50: 300, max: 1000 })]);
    expect(res.body.data[0].p95).toBeGreaterThan(res.body.data[0].p50);
  });

  it("lista las releases de la ventana con los fallos que estrenaron", async () => {
    await ingest({ application: "versiones", level: "info", environment: "production", message: "arranque", release: "2.0.0" });
    await ingest(failure({ application: "versiones", fingerprint: "nuevo-en-2", release: "2.0.0" }));

    const res = await request(app).get("/api/logs/releases?application=versiones").set(auth());
    expect(res.body.data).toEqual([expect.objectContaining({ application: "versiones", release: "2.0.0", count: 2, errors: 1, newGroups: 1 })]);
  });
});

describe("Vistas guardadas", () => {
  it("el dueno las crea y borra; se listan para el espacio", async () => {
    const created = await request(app).post("/api/views").set(auth()).send({ name: "Errores de cobros", path: "/logs", query: "?level=error&application=cobros" });
    expect(created.status).toBe(201);
    expect(created.body.data.query).toBe("level=error&application=cobros");

    const list = await request(app).get("/api/views").set(auth());
    expect(list.body.data.map((view: { name: string }) => view.name)).toEqual(["Errores de cobros"]);

    expect((await request(app).delete(`/api/views/${created.body.data.id}`).set(auth())).status).toBe(200);
    expect((await request(app).get("/api/views").set(auth())).body.data).toEqual([]);
  });

  it("rechaza una pantalla desconocida o algo que no sea una query", async () => {
    expect((await request(app).post("/api/views").set(auth()).send({ name: "x", path: "/admin", query: "a=1" })).status).toBe(400);
    expect((await request(app).post("/api/views").set(auth()).send({ name: "x", path: "/logs", query: "https://evil.example.com" })).status).toBe(400);
  });
});
