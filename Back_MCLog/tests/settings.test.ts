import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { createApiKey } from "../src/services/apiKeyService";
import { getSetting, refreshSettings } from "../src/services/settingsService";
import { runRetentionNow } from "../src/jobs/scheduler";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();

const PASSWORD = "Ajustes-Seguros-1";
const OTHER_ADMIN = "otro.admin.ajustes@example.com";
const OWNER = "duena.ajustes@example.com";
const EMAILS = [OTHER_ADMIN, OWNER, "a1.ajustes@example.com", "a2.ajustes@example.com", "a3.ajustes@example.com"];
const WS_PREFIX = "ajustes-test";

let rootToken: string;
let adminToken: string;
let ownerToken: string;
let ownerWs: number;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const login = async (email: string, password: string) => {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
};

const setSettings = (values: Record<string, unknown>) =>
  request(app).patch("/api/settings").set(bearer(rootToken)).send({ values });

const cleanup = async () => {
  await prisma.appSetting.deleteMany();
  await prisma.appSettingChange.deleteMany();
  await refreshSettings();
  const workspaces = await prisma.workspace.findMany({ where: { name: { startsWith: WS_PREFIX } }, select: { id: true } });
  const ids = workspaces.map((w) => w.id);
  await prisma.log.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.apiKey.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
};

beforeAll(async () => {
  await ensureAdminUser();
  await cleanup();
  rootToken = await login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);

  for (const [email, role, name] of [
    [OTHER_ADMIN, "admin", `${WS_PREFIX} admin`],
    [OWNER, "user", `${WS_PREFIX} duena`],
  ]) {
    const res = await request(app)
      .post("/auth/users")
      .set(bearer(rootToken))
      .send({ email, password: PASSWORD, role, mode: "own", workspaceName: name });
    expect(res.status).toBe(201);
  }
  adminToken = await login(OTHER_ADMIN, PASSWORD);
  ownerToken = await login(OWNER, PASSWORD);
  ownerWs = (await request(app).get("/auth/me").set(bearer(ownerToken))).body.data.workspaces[0].id;
});

// Cada test parte de la configuracion predeterminada y sin historial.
afterEach(async () => {
  await prisma.appSetting.deleteMany();
  await prisma.appSettingChange.deleteMany();
  await refreshSettings();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Acceso", () => {
  it("solo la cuenta root ve y cambia la configuracion", async () => {
    expect((await request(app).get("/api/settings")).status).toBe(401);
    expect((await request(app).get("/api/settings").set(bearer(ownerToken))).status).toBe(403);
    // Ni siquiera otro admin de plataforma.
    expect((await request(app).get("/api/settings").set(bearer(adminToken))).status).toBe(403);
    expect((await request(app).patch("/api/settings").set(bearer(adminToken)).send({ values: { labEnabled: false } })).status).toBe(403);

    const res = await request(app).get("/api/settings").set(bearer(rootToken));
    expect(res.status).toBe(200);
    const invitation = res.body.data.find((s: { key: string }) => s.key === "invitationTtlDays");
    expect(invitation).toMatchObject({ type: "number", value: 7, defaultValue: 7, overridden: false, min: 1, max: 30 });
  });

  it("cualquier sesion lee las banderas publicas", async () => {
    await setSettings({ labEnabled: false, maxWorkspaceMembers: 12 });
    const res = await request(app).get("/api/settings/public").set(bearer(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ labEnabled: false, maxWorkspaceMembers: 12, canCreateWorkspace: true, invitationTtlDays: 7 });
  });
});

describe("Validacion", () => {
  it("rechaza claves desconocidas, tipos y rangos incorrectos, y no aplica nada a medias", async () => {
    const res = await setSettings({ maxWorkspaceMembers: 5, invitationTtlDays: 99, labEnabled: "no", inventada: 1 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(["inventada", "invitationTtlDays", "labEnabled"]);
    expect(getSetting("maxWorkspaceMembers")).toBe(0);
  });

  it("guarda, informa de quien la cambio y vuelve al predeterminado", async () => {
    const saved = await setSettings({ invitationTtlDays: 3 });
    expect(saved.status).toBe(200);
    const row = saved.body.data.find((s: { key: string }) => s.key === "invitationTtlDays");
    expect(row).toMatchObject({ value: 3, overridden: true, updatedBy: process.env.ADMIN_EMAIL });

    const reset = await request(app).delete("/api/settings/invitationTtlDays").set(bearer(rootToken));
    expect(reset.body.data.find((s: { key: string }) => s.key === "invitationTtlDays")).toMatchObject({ value: 7, overridden: false });
  });
});

describe("Historial", () => {
  const history = (query = "") => request(app).get(`/api/settings/history${query}`).set(bearer(rootToken));

  it("solo lo ve la cuenta root", async () => {
    expect((await request(app).get("/api/settings/history").set(bearer(adminToken))).status).toBe(403);
    expect((await request(app).get("/api/settings/history").set(bearer(ownerToken))).status).toBe(403);
    expect((await history("?limit=0")).status).toBe(400);
  });

  it("guarda quien cambio que y de que valor a cual, tambien al restablecer", async () => {
    await setSettings({ invitationTtlDays: 3, labEnabled: false });
    await setSettings({ invitationTtlDays: 5 });
    await request(app).delete("/api/settings/invitationTtlDays").set(bearer(rootToken));

    const res = await history();
    expect(res.status).toBe(200);
    const rows = res.body.data.map(({ key, from, to, reset, by }: Record<string, unknown>) => ({ key, from, to, reset, by }));
    const by = process.env.ADMIN_EMAIL;
    // Del mas reciente al mas antiguo; los de un mismo guardado, en el orden en que se enviaron.
    expect(rows).toEqual([
      { key: "invitationTtlDays", from: 5, to: 7, reset: true, by },
      { key: "invitationTtlDays", from: 3, to: 5, reset: false, by },
      { key: "labEnabled", from: true, to: false, reset: false, by },
      { key: "invitationTtlDays", from: 7, to: 3, reset: false, by },
    ]);
    expect(res.body.nextBefore).toBeNull();
  });

  it("no apunta lo que no cambia", async () => {
    await setSettings({ invitationTtlDays: 7 });
    await request(app).delete("/api/settings/labEnabled").set(bearer(rootToken));
    expect((await history()).body.data).toEqual([]);
  });

  it("pagina con before", async () => {
    for (const days of [2, 3, 4]) await setSettings({ invitationTtlDays: days });
    const first = await history("?limit=2");
    expect(first.body.data.map((row: { to: number }) => row.to)).toEqual([4, 3]);
    expect(first.body.nextBefore).toBe(first.body.data[1].id);

    const second = await history(`?limit=2&before=${first.body.nextBefore}`);
    expect(second.body.data.map((row: { to: number }) => row.to)).toEqual([2]);
    expect(second.body.nextBefore).toBeNull();
  });
});

describe("Efecto de cada configuracion", () => {
  it("limita los miembros de un espacio, contando pendientes", async () => {
    await setSettings({ maxWorkspaceMembers: 2 });
    const first = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: "a1.ajustes@example.com" });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: "a2.ajustes@example.com" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/limit of 2 members/);
    await prisma.user.deleteMany({ where: { email: "a1.ajustes@example.com" } });
  });

  it("limita las altas por dia en un espacio", async () => {
    // La propia dueña entro hoy: con 2 al dia solo cabe una alta mas.
    await setSettings({ maxInvitationsPerDay: 2 });
    const first = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: "a2.ajustes@example.com" });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: "a3.ajustes@example.com" });
    expect(second.status).toBe(429);
    await prisma.user.deleteMany({ where: { email: "a2.ajustes@example.com" } });
  });

  it("el enlace de invitacion caduca segun la configuracion", async () => {
    await setSettings({ invitationTtlDays: 2 });
    await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: "a3.ajustes@example.com" });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "a3.ajustes@example.com" }, include: { passwordResetTokens: true } });
    const days = (user.passwordResetTokens[0].expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(1.9);
    expect(days).toBeLessThanOrEqual(2);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("puede reservar la creacion de espacios a los admins", async () => {
    await setSettings({ allowWorkspaceCreation: false });
    const denied = await request(app).post("/api/workspaces").set(bearer(ownerToken)).send({ name: `${WS_PREFIX} extra` });
    expect(denied.status).toBe(403);
    const pub = await request(app).get("/api/settings/public").set(bearer(ownerToken));
    expect(pub.body.data.canCreateWorkspace).toBe(false);

    const admin = await request(app).post("/api/workspaces").set(bearer(adminToken)).send({ name: `${WS_PREFIX} del admin` });
    expect(admin.status).toBe(201);
  });

  it("limita cuantos espacios puede poseer una cuenta", async () => {
    await setSettings({ maxOwnedWorkspaces: 1 });
    const res = await request(app).post("/api/workspaces").set(bearer(ownerToken)).send({ name: `${WS_PREFIX} segundo` });
    expect(res.status).toBe(409);
  });

  it("apagar el Lab corta la ingesta con sesion, pero no la de las API keys", async () => {
    await setSettings({ labEnabled: false });
    const log = { application: "ajustes", level: "info", environment: "development", message: "hola" };
    const withSession = await request(app).post("/api/log").set({ ...bearer(ownerToken), "X-Workspace-Id": String(ownerWs) }).send(log);
    expect(withSession.status).toBe(403);

    const { key } = await createApiKey({ workspaceId: ownerWs, name: "ajustes", scopes: ["ingest"] });
    const withKey = await request(app).post("/api/log").set("x-api-key", key).send(log);
    expect(withKey.status).toBe(201);
  });

  it("apagar MCP responde 404 sin reiniciar", async () => {
    await setSettings({ mcpEnabled: false });
    const res = await request(app)
      .post("/mcp")
      .set(bearer(ownerToken))
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(404);
  });

  it("el tamaño maximo del lote se aplica al momento", async () => {
    await setSettings({ maxBatchSize: 2 });
    const log = { application: "ajustes", level: "info", environment: "development", message: "hola" };
    const res = await request(app)
      .post("/api/logs/batch")
      .set({ ...bearer(ownerToken), "X-Workspace-Id": String(ownerWs) })
      .send({ logs: [log, log, log] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 2/);
  });

  it("la retencion guardada manda sobre la variable de entorno", async () => {
    await prisma.log.create({
      data: {
        workspaceId: ownerWs,
        application: "ajustes-retencion",
        level: "info",
        environment: "development",
        message: "viejo",
        timestamp: new Date(Date.now() - 400 * 86_400_000),
      },
    });
    await setSettings({ retentionMonths: 3 });
    expect(await runRetentionNow()).toBeGreaterThanOrEqual(1);
    expect(await prisma.log.count({ where: { application: "ajustes-retencion" } })).toBe(0);
  });
});
