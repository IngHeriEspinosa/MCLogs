import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { refreshSettings } from "../src/services/settingsService";
import { purgeExpiredSnapshots } from "../src/services/snapshotService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();

const PASSWORD = "Snapshots-Seguros-1";
const OWNER = "duena.snap@example.com";
const MEMBER = "miembro.snap@example.com";
const OUTSIDER = "ajeno.snap@example.com";
const MANAGED_EMAILS = [OWNER, MEMBER, OUTSIDER];
const WS_PREFIX = "snap-test";
const APP = "snap-app";

let rootToken: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let ws: number;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const as = (token: string) => ({ ...bearer(token), "X-Workspace-Id": String(ws) });

const login = async (email: string) => {
  const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
};

const createAccount = async (email: string) => {
  const res = await request(app)
    .post("/auth/users")
    .set(bearer(rootToken))
    .send({ email, password: PASSWORD, mode: "own", workspaceName: `${WS_PREFIX} ${email}` });
  expect(res.status).toBe(201);
};

const setSettings = (values: Record<string, unknown>) =>
  request(app).patch("/api/settings").set(bearer(rootToken)).send({ values });

const create = (token: string, body: Record<string, unknown>) =>
  request(app)
    .post("/api/snapshots")
    .set(as(token))
    .send({ title: "Incidente", visibility: "workspace", filters: { application: APP }, ...body });

const cleanup = async () => {
  const workspaces = await prisma.workspace.findMany({ where: { name: { startsWith: WS_PREFIX } }, select: { id: true } });
  const ids = workspaces.map((w) => w.id);
  await prisma.snapshot.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.log.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: MANAGED_EMAILS } } });
  await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
  await prisma.appSetting.deleteMany({ where: { key: { in: ["publicSnapshotsEnabled", "maxSnapshotRows"] } } });
  await refreshSettings();
};

beforeAll(async () => {
  await ensureAdminUser();
  rootToken = (await request(app).post("/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).body
    .accessToken;
  await cleanup();

  for (const email of MANAGED_EMAILS) await createAccount(email);
  ownerToken = await login(OWNER);
  memberToken = await login(MEMBER);
  outsiderToken = await login(OUTSIDER);
  ws = (await request(app).get("/auth/me").set(bearer(ownerToken))).body.data.workspaces[0].id;
  const added = await request(app).post(`/api/workspaces/${ws}/members`).set(bearer(ownerToken)).send({ email: MEMBER });
  expect(added.status).toBe(201);

  // Doce logs con datos sensibles, y uno de otra aplicacion que el filtro deja fuera.
  const logs = Array.from({ length: 12 }, (_, i) => ({
    application: APP,
    level: i % 3 === 0 ? "error" : "info",
    environment: "production",
    message: `pedido ${i} de cliente@empresa.com con token=abcdef123456`,
    errorName: i % 3 === 0 ? "TypeError" : undefined,
    metadata: { password: "hunter2", contacto: "otra@empresa.com", pedido: i },
    timestamp: new Date(Date.now() - i * 60_000).toISOString(),
  }));
  logs.push({ ...logs[0], application: "snap-otra" });
  const res = await request(app).post("/api/logs/batch").set(as(ownerToken)).send({ logs });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("crear snapshots", () => {
  it("un miembro crea uno de equipo con el resumen y los logs filtrados, sin enmascarar", async () => {
    const res = await create(memberToken, {});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ visibility: "workspace", redacted: false, totalMatched: 12, createdByEmail: MEMBER });
    expect(res.body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Un rango abierto se cierra en el momento de la captura.
    expect(res.body.data.filters.to).toBeTruthy();

    const view = await request(app).get(`/snapshots/${res.body.data.token}`).set(bearer(memberToken));
    expect(view.status).toBe(200);
    expect(view.body.data.logs).toHaveLength(12);
    expect(view.body.data.logs[0].message).toContain("cliente@empresa.com");
    expect(view.body.data.summary).toMatchObject({ total: 12, byLevel: { error: 4, info: 8 }, distinctErrors: 1 });
    expect(view.body.data.workspaceName).toBe(`${WS_PREFIX} ${OWNER}`);
  });

  it("un miembro no puede crear uno publico; el dueño si", async () => {
    expect((await create(memberToken, { visibility: "public" })).status).toBe(403);
    expect((await create(ownerToken, { visibility: "public" })).status).toBe(201);
  });

  it("con los publicos apagados en la configuracion, no se crean", async () => {
    expect((await setSettings({ publicSnapshotsEnabled: false })).status).toBe(200);
    expect((await create(ownerToken, { visibility: "public" })).status).toBe(403);
    expect((await create(ownerToken, { visibility: "workspace" })).status).toBe(201);
    await setSettings({ publicSnapshotsEnabled: true });
  });

  it("respeta el tope de filas, pero cuenta todas las que cumplian los filtros", async () => {
    await setSettings({ maxSnapshotRows: 10 });
    const res = await create(ownerToken, {});
    expect(res.body.data.totalMatched).toBe(12);
    const view = await request(app).get(`/snapshots/${res.body.data.token}`).set(bearer(ownerToken));
    expect(view.body.data.logs).toHaveLength(10);
    await setSettings({ maxSnapshotRows: 500 });
  });

  it("valida la entrada", async () => {
    expect((await create(ownerToken, { title: "" })).status).toBe(400);
    expect((await create(ownerToken, { visibility: "todos" })).status).toBe(400);
    expect((await create(ownerToken, { expiresInDays: 3 })).status).toBe(400);
    expect((await create(ownerToken, { filters: { level: "fatal" } })).status).toBe(400);
  });
});

describe("leer snapshots", () => {
  it("uno publico se abre sin sesion y llega enmascarado, sin el nombre del espacio", async () => {
    const created = await create(ownerToken, { visibility: "public", filters: { application: APP, search: "cliente@empresa.com" } });
    const res = await request(app).get(`/snapshots/${created.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data.redacted).toBe(true);
    expect(res.body.data.workspaceName).toBeNull();
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain("empresa.com");
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("abcdef123456");
    expect(res.body.data.logs[0].metadata.pedido).toBe(0);
  });

  it("uno de equipo pide sesion al anonimo y es 404 para quien no es miembro", async () => {
    const created = await create(ownerToken, {});
    const anonymous = await request(app).get(`/snapshots/${created.body.data.token}`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toMatchObject({ requiresAuth: true });
    expect(anonymous.body.data).toBeUndefined();
    expect((await request(app).get(`/snapshots/${created.body.data.token}`).set(bearer(outsiderToken))).status).toBe(404);
  });

  it("un enlace inventado o caducado da 404, y la purga borra los caducados", async () => {
    expect((await request(app).get(`/snapshots/${"x".repeat(43)}`)).status).toBe(404);
    const created = await create(ownerToken, { visibility: "public", expiresInDays: 1 });
    await prisma.snapshot.update({ where: { id: created.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/snapshots/${created.body.data.token}`)).status).toBe(404);
    expect(await purgeExpiredSnapshots()).toBeGreaterThanOrEqual(1);
    expect(await prisma.snapshot.findUnique({ where: { id: created.body.data.id } })).toBeNull();
  });

  it("apagar los publicos corta tambien los ya creados, y encenderlos los devuelve", async () => {
    const created = await create(ownerToken, { visibility: "public" });
    await setSettings({ publicSnapshotsEnabled: false });
    expect((await request(app).get(`/snapshots/${created.body.data.token}`)).status).toBe(404);
    await setSettings({ publicSnapshotsEnabled: true });
    expect((await request(app).get(`/snapshots/${created.body.data.token}`)).status).toBe(200);
  });

  it("cuenta las visitas", async () => {
    const created = await create(ownerToken, { visibility: "public" });
    await request(app).get(`/snapshots/${created.body.data.token}`);
    await request(app).get(`/snapshots/${created.body.data.token}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const row = await prisma.snapshot.findUnique({ where: { id: created.body.data.id } });
    expect(row?.viewCount).toBe(2);
  });
});

describe("gestionar snapshots", () => {
  it("lista solo los del espacio activo, sin los datos", async () => {
    const res = await request(app).get("/api/snapshots").set(as(memberToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].logs).toBeUndefined();
    expect(res.body.data[0].summary).toBeUndefined();
    const outsider = await request(app).get("/api/snapshots").set(bearer(outsiderToken));
    expect(outsider.body.data).toEqual([]);
  });

  it("lo borra su autor o el dueño, no otro miembro", async () => {
    const byOwner = await create(ownerToken, {});
    expect((await request(app).delete(`/api/snapshots/${byOwner.body.data.id}`).set(as(memberToken))).status).toBe(403);
    expect((await request(app).delete(`/api/snapshots/${byOwner.body.data.id}`).set(as(ownerToken))).status).toBe(204);

    const byMember = await create(memberToken, {});
    expect((await request(app).delete(`/api/snapshots/${byMember.body.data.id}`).set(as(memberToken))).status).toBe(204);
    expect((await request(app).get(`/snapshots/${byMember.body.data.token}`).set(bearer(memberToken))).status).toBe(404);
  });

  it("no se borra desde otro espacio", async () => {
    const created = await create(ownerToken, {});
    expect((await request(app).delete(`/api/snapshots/${created.body.data.id}`).set(bearer(outsiderToken))).status).toBe(404);
  });
});
