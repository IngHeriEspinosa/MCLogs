import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { evaluateRule } from "../src/alerts/evaluator";
import { getDefaultWorkspaceId, purgeDeletedWorkspaces } from "../src/services/workspaceService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();

const PASSWORD = "Espacios-Seguros-1";
const OWNER_B = "duena.b@example.com";
const MEMBER = "miembro.ws@example.com";
const INVITED = "invitado.ws@example.com";
const PENDING = "pendiente.ws@example.com";
const MANAGED_EMAILS = [OWNER_B, MEMBER, INVITED, PENDING];
const WS_PREFIX = "ws-test";
const APPS = ["ws-iso-a", "ws-iso-b", "ws-alerta", "ws-clave"];

let adminToken: string;
let adminWs: number;
let ownerToken: string;
let ownerWs: number;
let memberToken: string;
let adminLogId: number;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const as = (token: string, workspaceId?: number) => ({
  ...bearer(token),
  ...(workspaceId ? { "X-Workspace-Id": String(workspaceId) } : {}),
});

const login = async (email: string, password: string) => {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
};

const logOf = (application: string, extra: Record<string, unknown> = {}) => ({
  application,
  level: "error",
  environment: "production",
  message: `fallo en ${application}`,
  ...extra,
});

/** Borra todo lo que crean estos tests: espacios con el prefijo y sus datos, y las cuentas. */
const cleanup = async () => {
  const workspaces = await prisma.workspace.findMany({ where: { name: { startsWith: WS_PREFIX } }, select: { id: true } });
  const ids = workspaces.map((w) => w.id);
  await prisma.log.deleteMany({ where: { OR: [{ workspaceId: { in: ids } }, { application: { in: APPS } }] } });
  await prisma.alertRule.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.alertChannel.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.apiKey.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: MANAGED_EMAILS } } });
  await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
};

beforeAll(async () => {
  await ensureAdminUser();
  await cleanup();
  adminWs = (await getDefaultWorkspaceId())!;
  adminToken = await login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);

  // El admin de plataforma da de alta una cuenta con espacio propio...
  const created = await request(app)
    .post("/auth/users")
    .set(bearer(adminToken))
    .send({ email: OWNER_B, password: PASSWORD, mode: "own", workspaceName: `${WS_PREFIX} B` });
  expect(created.status).toBe(201);
  ownerToken = await login(OWNER_B, PASSWORD);
  const me = await request(app).get("/auth/me").set(bearer(ownerToken));
  expect(me.body.data.workspaces).toHaveLength(1);
  ownerWs = me.body.data.workspaces[0].id;
  expect(me.body.data.workspaces[0]).toMatchObject({ name: `${WS_PREFIX} B`, role: "owner" });

  // ...y otra que la dueña de B sumara a su espacio como miembro.
  const member = await request(app)
    .post("/auth/users")
    .set(bearer(adminToken))
    .send({ email: MEMBER, password: PASSWORD, mode: "own", workspaceName: `${WS_PREFIX} miembro` });
  expect(member.status).toBe(201);
  memberToken = await login(MEMBER, PASSWORD);

  // Un log en cada espacio, con el mismo traceId para probar las trazas.
  const a = await request(app).post("/api/log").set(as(adminToken, adminWs)).send(logOf("ws-iso-a", { traceId: "ws-traza-comun" }));
  expect(a.status).toBe(201);
  adminLogId = a.body.id;
  const b = await request(app).post("/api/log").set(as(ownerToken, ownerWs)).send(logOf("ws-iso-b", { traceId: "ws-traza-comun" }));
  expect(b.status).toBe(201);
  expect(b.body.workspaceId).toBe(ownerWs);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Aislamiento entre espacios", () => {
  it("cada cuenta nueva ve solo su espacio, nunca los datos del admin", async () => {
    const res = await request(app).get("/api/logs").query({ search: "ws-iso" }).set(as(ownerToken, ownerWs));
    expect(res.status).toBe(200);
    expect(res.body.data.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);
  });

  it("sin cabecera usa el espacio por defecto del usuario", async () => {
    const res = await request(app).get("/api/logs").query({ search: "ws-iso" }).set(bearer(ownerToken));
    expect(res.body.data.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);
  });

  it("un espacio ajeno en la cabecera responde 404, no 403", async () => {
    const res = await request(app).get("/api/logs").set(as(ownerToken, adminWs));
    expect(res.status).toBe(404);
    const invalid = await request(app).get("/api/logs").set({ ...bearer(ownerToken), "X-Workspace-Id": "abc" });
    expect(invalid.status).toBe(400);
  });

  it("el admin de plataforma entra a cualquier espacio como dueño, sin ser miembro", async () => {
    expect(await prisma.workspaceMember.findFirst({ where: { workspaceId: ownerWs, user: { email: process.env.ADMIN_EMAIL } } })).toBeNull();

    const logs = await request(app).get("/api/logs").query({ search: "ws-iso" }).set(as(adminToken, ownerWs));
    expect(logs.status).toBe(200);
    expect(logs.body.data.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);

    const members = await request(app).get(`/api/workspaces/${ownerWs}/members`).set(bearer(adminToken));
    expect(members.status).toBe(200);

    const list = await request(app).get("/api/workspaces").set(bearer(adminToken));
    const seen = list.body.data.find((w: { id: number }) => w.id === ownerWs);
    expect(seen?.role).toBe("owner");

    const unknown = await request(app).get("/api/logs").set(as(adminToken, 999999));
    expect(unknown.status).toBe(404);
  });

  it("un log de otro espacio no existe por id ni por contexto", async () => {
    expect((await request(app).get(`/api/logs/${adminLogId}`).set(as(ownerToken, ownerWs))).status).toBe(404);
    expect((await request(app).get(`/api/logs/${adminLogId}/context`).set(as(ownerToken, ownerWs))).status).toBe(404);
    expect((await request(app).get(`/api/logs/${adminLogId}`).set(as(adminToken, adminWs))).status).toBe(200);
  });

  it("las trazas, estadisticas, errores y aplicaciones solo cuentan el propio espacio", async () => {
    const trace = await request(app).get("/api/logs/trace/ws-traza-comun").set(as(ownerToken, ownerWs));
    expect(trace.body.data.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);

    const stats = await request(app).get("/api/logs/stats").set(as(ownerToken, ownerWs));
    const apps = stats.body.byApplication.map((row: { application: string }) => row.application);
    expect(apps).toContain("ws-iso-b");
    expect(apps).not.toContain("ws-iso-a");

    const groups = await request(app).get("/api/logs/errors/groups").set(as(ownerToken, ownerWs));
    expect(groups.body.data.every((group: { application: string }) => group.application !== "ws-iso-a")).toBe(true);

    const applications = await request(app).get("/api/logs/applications").set(as(ownerToken, ownerWs));
    expect(applications.body.data.map((row: { application: string }) => row.application)).toEqual(["ws-iso-b"]);
  });

  it("el MCP con sesion tambien queda acotado al espacio", async () => {
    const res = await request(app)
      .post("/mcp")
      .set(as(ownerToken, ownerWs))
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_logs", arguments: { query: "ws-iso" } } });
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.logs.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);
  });

  it("una API key escribe en su espacio aunque la peticion diga otro", async () => {
    const created = await request(app)
      .post("/api/keys")
      .set(as(ownerToken, ownerWs))
      .send({ name: "ingesta B", scopes: ["ingest", "read"] });
    expect(created.status).toBe(201);
    expect(created.body.apiKey.workspaceId).toBe(ownerWs);

    const res = await request(app)
      .post("/api/log")
      .set({ "x-api-key": created.body.key, "X-Workspace-Id": String(adminWs) })
      .send(logOf("ws-clave"));
    expect(res.status).toBe(201);
    expect(res.body.workspaceId).toBe(ownerWs);

    // Y el admin no la ve entre sus claves.
    const adminKeys = await request(app).get("/api/keys").set(as(adminToken, adminWs));
    expect(adminKeys.body.data.some((key: { id: number }) => key.id === created.body.apiKey.id)).toBe(false);
    // Ni puede revocarla desde su espacio.
    const revoke = await request(app).delete(`/api/keys/${created.body.apiKey.id}`).set(as(adminToken, adminWs));
    expect(revoke.status).toBe(404);
  });

  it("una regla no puede enlazar el canal de otro espacio", async () => {
    const channel = await request(app)
      .post("/api/alerts/channels")
      .set(as(adminToken, adminWs))
      .send({ name: `${WS_PREFIX} canal`, type: "webhook", config: { url: "https://ejemplo.invalid/hook" } });
    expect(channel.status).toBe(201);

    const rule = await request(app)
      .post("/api/alerts/rules")
      .set(as(ownerToken, ownerWs))
      .send({ name: "robo de canal", channelIds: [channel.body.data.id] });
    expect(rule.status).toBe(400);

    await prisma.alertChannel.delete({ where: { id: channel.body.data.id } });
  });

  it("una regla de alerta solo cuenta los logs de su espacio", async () => {
    await prisma.log.createMany({
      data: Array.from({ length: 3 }, () => ({
        workspaceId: adminWs,
        application: "ws-alerta",
        level: "error" as const,
        environment: "production" as const,
        message: "fallo del admin",
      })),
    });
    const rule = await prisma.alertRule.create({
      data: { workspaceId: ownerWs, name: "alerta B", application: "ws-alerta", threshold: 1 },
      include: { channels: true },
    });
    expect(await evaluateRule(rule)).toBe(false);
  });
});

describe("Roles dentro del espacio", () => {
  beforeAll(async () => {
    const res = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: MEMBER });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: false, member: { email: MEMBER, role: "member", pending: false } });
  });

  it("el miembro ve la observabilidad del espacio", async () => {
    const me = await request(app).get("/auth/me").set(bearer(memberToken));
    expect(me.body.data.workspaces.map((w: { id: number; role: string }) => [w.id, w.role])).toContainEqual([ownerWs, "member"]);

    const res = await request(app).get("/api/logs").query({ search: "ws-iso" }).set(as(memberToken, ownerWs));
    expect(res.status).toBe(200);
    expect(res.body.data.map((log: { application: string }) => log.application)).toEqual(["ws-iso-b"]);
  });

  it("el miembro no accede a nada de administracion", async () => {
    const headers = as(memberToken, ownerWs);
    expect((await request(app).get("/api/keys").set(headers)).status).toBe(403);
    expect((await request(app).get("/api/alerts/rules").set(headers)).status).toBe(403);
    expect((await request(app).get("/api/alerts/channels").set(headers)).status).toBe(403);
    expect((await request(app).delete("/api/logs").query({ before: new Date().toISOString() }).set(headers)).status).toBe(403);
    expect((await request(app).post("/api/log").set(headers).send(logOf("ws-iso-b"))).status).toBe(403);
    expect((await request(app).get(`/api/workspaces/${ownerWs}/members`).set(bearer(memberToken))).status).toBe(403);
    expect((await request(app).get("/auth/users").set(bearer(memberToken))).status).toBe(403);
  });

  it("siempre queda al menos un dueño", async () => {
    const me = await request(app).get("/auth/me").set(bearer(ownerToken));
    const ownerId = me.body.data.id;
    const demote = await request(app)
      .patch(`/api/workspaces/${ownerWs}/members/${ownerId}`)
      .set(bearer(ownerToken))
      .send({ role: "member" });
    expect(demote.status).toBe(409);
    const leave = await request(app).delete(`/api/workspaces/${ownerWs}/members/${ownerId}`).set(bearer(ownerToken));
    expect(leave.status).toBe(409);
  });

  it("un miembro solo puede quitarse a si mismo", async () => {
    const me = await request(app).get("/auth/me").set(bearer(ownerToken));
    const kick = await request(app).delete(`/api/workspaces/${ownerWs}/members/${me.body.data.id}`).set(bearer(memberToken));
    expect(kick.status).toBe(403);
  });
});

describe("Invitaciones", () => {
  it("invita a un correo sin cuenta y la cuenta se activa con el enlace", async () => {
    const res = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: INVITED });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: true, emailSent: false, member: { pending: true, role: "member" } });
    const path: string = res.body.data.invitePath;
    expect(path).toMatch(/^\/reset-password\?token=[\w-]+&invite=1$/);

    // Pendiente: no puede entrar, ni siquiera adivinando una contrasena.
    const early = await request(app).post("/auth/login").send({ email: INVITED, password: PASSWORD });
    expect(early.status).toBe(401);

    const token = new URL(path, "http://x").searchParams.get("token");
    const activate = await request(app).post("/auth/password/reset").send({ token, password: PASSWORD });
    expect(activate.status).toBe(200);

    const invitedToken = await login(INVITED, PASSWORD);
    const me = await request(app).get("/auth/me").set(bearer(invitedToken));
    expect(me.body.data.activatedAt).not.toBeNull();
    expect(me.body.data.workspaces).toEqual([expect.objectContaining({ id: ownerWs, role: "member" })]);
  });

  it("no invita dos veces a la misma persona", async () => {
    const res = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: INVITED });
    expect(res.status).toBe(409);
  });

  it("quitar a un invitado pendiente borra su cuenta", async () => {
    const res = await request(app).post(`/api/workspaces/${ownerWs}/members`).set(bearer(ownerToken)).send({ email: PENDING });
    const userId = res.body.data.member.userId;

    const resend = await request(app).post(`/api/workspaces/${ownerWs}/members/${userId}/resend`).set(bearer(ownerToken));
    expect(resend.status).toBe(200);
    expect(resend.body.data.invitePath).toMatch(/invite=1$/);

    const removed = await request(app).delete(`/api/workspaces/${ownerWs}/members/${userId}`).set(bearer(ownerToken));
    expect(removed.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
  });

  it("el admin de plataforma suma cuentas a cualquier espacio, aunque no sea miembro", async () => {
    const res = await request(app)
      .post("/auth/users")
      .set(bearer(adminToken))
      .send({ email: PENDING, mode: "join", workspaceId: ownerWs });
    expect(res.status).toBe(201);
    expect(res.body.data.activatedAt).toBeNull();
    expect(await prisma.workspaceMember.findFirst({ where: { workspaceId: ownerWs, user: { email: PENDING } } })).not.toBeNull();

    const missing = await request(app)
      .post("/auth/users")
      .set(bearer(adminToken))
      .send({ email: "otro.pendiente@example.com", mode: "join", workspaceId: 999999 });
    expect(missing.status).toBe(403);
  });
});

describe("Ciclo de vida del espacio", () => {
  it("cualquiera crea espacios, y borrarlo exige su nombre", async () => {
    const created = await request(app).post("/api/workspaces").set(bearer(memberToken)).send({ name: `${WS_PREFIX} extra` });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    await request(app).post("/api/log").set(as(memberToken, id)).send(logOf("ws-iso-b"));

    const wrong = await request(app).delete(`/api/workspaces/${id}`).set(bearer(memberToken)).send({ confirmName: "otro" });
    expect(wrong.status).toBe(400);
    const ok = await request(app).delete(`/api/workspaces/${id}`).set(bearer(memberToken)).send({ confirmName: `${WS_PREFIX} extra` });
    expect(ok.status).toBe(200);

    // Deja de verse al instante; el planificador purga despues sus logs.
    expect((await request(app).get("/api/logs").set(as(memberToken, id))).status).toBe(404);
    await purgeDeletedWorkspaces();
    expect(await prisma.workspace.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.log.count({ where: { workspaceId: id } })).toBe(0);
  });

  it("un espacio sin miembros (cuentas borradas a mano en la base de datos) se purga", async () => {
    const orphan = await prisma.workspace.create({ data: { name: `${WS_PREFIX} huerfano` } });
    const key = await prisma.apiKey.create({
      data: { workspaceId: orphan.id, name: "huerfana", prefix: "mclog_0000beef", keyHash: "0".repeat(64), scopes: ["ingest"], applications: [] },
    });
    await purgeDeletedWorkspaces();
    expect(await prisma.workspace.findUnique({ where: { id: orphan.id } })).toBeNull();
    expect(await prisma.apiKey.findUnique({ where: { id: key.id } })).toBeNull();
  });

  it("no se borra una cuenta que es la unica duena de un espacio con mas gente", async () => {
    const me = await request(app).get("/auth/me").set(bearer(ownerToken));
    const res = await request(app).delete(`/auth/users/${me.body.data.id}`).set(bearer(adminToken));
    expect(res.status).toBe(409);
  });
});
