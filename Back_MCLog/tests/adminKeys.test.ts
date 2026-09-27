import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { config } from "../src/config/env";
import { ensureAdminUser } from "../src/services/authService";
import { getDefaultWorkspaceId } from "../src/services/workspaceService";
import { createApiKey, resetApiKeyCaches } from "../src/services/apiKeyService";
import {
  INVENTORY_THRESHOLDS,
  InventoryKey,
  apiKeyStatus,
  assessApiKey,
  summarizeInventory,
} from "../src/services/apiKeyInventoryService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-27T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

/** Clave activa, restringida, con caducidad y usada ayer: sin motivos de revision. */
const healthyKey = (overrides: Partial<Parameters<typeof assessApiKey>[0]> = {}) => ({
  scopes: ["read"],
  applications: ["facturacion"],
  createdAt: daysAgo(30),
  expiresAt: inDays(60),
  lastUsedAt: daysAgo(1),
  revokedAt: null,
  ...overrides,
});

describe("Evaluacion de una clave", () => {
  it("una clave restringida, con caducidad y en uso no tiene motivos de revision", () => {
    expect(assessApiKey(healthyKey(), NOW)).toEqual([]);
  });

  it("estado: revocada gana a caducada, y caducar en este instante ya cuenta", () => {
    expect(apiKeyStatus({ revokedAt: daysAgo(1), expiresAt: daysAgo(2) }, NOW)).toBe("revoked");
    expect(apiKeyStatus({ revokedAt: null, expiresAt: NOW }, NOW)).toBe("expired");
    expect(apiKeyStatus({ revokedAt: null, expiresAt: inDays(1) }, NOW)).toBe("active");
    expect(apiKeyStatus({ revokedAt: null, expiresAt: null }, NOW)).toBe("active");
  });

  it("una clave revocada o caducada no tiene riesgos: ya no puede hacer nada", () => {
    const risky = { applications: [], expiresAt: null, lastUsedAt: null, createdAt: daysAgo(400) };
    expect(assessApiKey(healthyKey({ ...risky, revokedAt: daysAgo(1) }), NOW)).toEqual([]);
    expect(assessApiKey(healthyKey({ ...risky, expiresAt: daysAgo(1) }), NOW)).toEqual([]);
  });

  it("lectura sin restriccion por aplicacion", () => {
    expect(assessApiKey(healthyKey({ applications: [] }), NOW)).toEqual(["read-unrestricted"]);
  });

  it("lectura sin caducidad", () => {
    expect(assessApiKey(healthyKey({ expiresAt: null }), NOW)).toEqual(["read-no-expiry"]);
  });

  it("ingesta sin restriccion, pero sin avisar de caducidad: una ingesta sin fecha es lo normal", () => {
    expect(assessApiKey(healthyKey({ scopes: ["ingest"], applications: [], expiresAt: null }), NOW)).toEqual([
      "ingest-unrestricted",
    ]);
  });

  it("una clave solo de metricas no tiene aplicaciones que restringir", () => {
    expect(assessApiKey(healthyKey({ scopes: ["metrics"], applications: [], expiresAt: null }), NOW)).toEqual([]);
  });

  it("abandonada: usada, pero no en los ultimos 90 dias (el dia 90 aun no cuenta)", () => {
    const days = INVENTORY_THRESHOLDS.staleAfterDays;
    expect(assessApiKey(healthyKey({ createdAt: daysAgo(400), lastUsedAt: daysAgo(days) }), NOW)).toEqual([]);
    expect(assessApiKey(healthyKey({ createdAt: daysAgo(400), lastUsedAt: daysAgo(days + 1) }), NOW)).toEqual(["stale"]);
  });

  it("nunca usada: solo pasado el margen de los primeros dias", () => {
    const grace = INVENTORY_THRESHOLDS.neverUsedGraceDays;
    expect(assessApiKey(healthyKey({ lastUsedAt: null, createdAt: daysAgo(grace) }), NOW)).toEqual([]);
    expect(assessApiKey(healthyKey({ lastUsedAt: null, createdAt: daysAgo(grace + 1) }), NOW)).toEqual(["never-used"]);
  });

  it("caduca pronto: dentro de los proximos 14 dias", () => {
    const soon = INVENTORY_THRESHOLDS.expiringSoonDays;
    expect(assessApiKey(healthyKey({ expiresAt: inDays(soon) }), NOW)).toEqual(["expiring-soon"]);
    expect(assessApiKey(healthyKey({ expiresAt: inDays(soon + 1) }), NOW)).toEqual([]);
  });

  it("varios motivos salen ordenados de mas a menos grave", () => {
    const key = healthyKey({ scopes: ["ingest", "read"], applications: [], expiresAt: null, lastUsedAt: daysAgo(200) });
    expect(assessApiKey(key, NOW)).toEqual(["read-unrestricted", "stale", "ingest-unrestricted", "read-no-expiry"]);
  });
});

describe("Resumen del inventario", () => {
  const entry = (overrides: Partial<InventoryKey>): InventoryKey =>
    ({
      id: 1,
      workspaceId: 1,
      workspace: { id: 1, name: "A" },
      createdBy: null,
      name: "k",
      prefix: "mclog_00000000",
      scopes: ["ingest"],
      applications: [],
      createdAt: daysAgo(10),
      expiresAt: null,
      lastUsedAt: null,
      lastMcpUsedAt: null,
      revokedAt: null,
      createdById: null,
      status: "active",
      risks: [],
      ...overrides,
    }) as InventoryKey;

  it("cuenta activas, inactivas, lectura, riesgos, uso por MCP en 30 dias y espacios con claves activas", () => {
    const summary = summarizeInventory(
      [
        entry({ id: 1, scopes: ["read"], risks: ["read-unrestricted"], lastMcpUsedAt: daysAgo(2) }),
        entry({ id: 2, scopes: ["read"], lastMcpUsedAt: daysAgo(INVENTORY_THRESHOLDS.mcpActiveDays + 1) }),
        entry({ id: 3, workspace: { id: 2, name: "B" }, risks: ["ingest-unrestricted"] }),
        entry({ id: 4, workspace: { id: 3, name: "C" }, status: "revoked", scopes: ["read"], lastMcpUsedAt: daysAgo(1) }),
        entry({ id: 5, workspace: { id: 3, name: "C" }, status: "expired" }),
      ],
      NOW,
    );
    expect(summary).toEqual({ total: 5, active: 3, inactive: 2, activeRead: 2, withRisks: 2, mcpActive: 1, workspaces: 2 });
  });
});

describe("Inventario de claves de la plataforma", () => {
  let adminToken: string;
  let ownerToken: string;
  let defaultWorkspaceId: number;
  let otherWorkspaceId: number;
  let deletedWorkspaceId: number;

  const inventory = () => request(app).get("/api/admin/keys").set("Authorization", `Bearer ${adminToken}`);
  const findKey = (body: { data: InventoryKey[] }, id: number) => body.data.find((key) => key.id === id);

  beforeAll(async () => {
    await ensureAdminUser();
    defaultWorkspaceId = (await getDefaultWorkspaceId())!;
    await prisma.apiKey.deleteMany();
    resetApiKeyCaches();

    // Dueño de su propio espacio, sin rol de plataforma: no debe ver el inventario.
    const hash = await bcrypt.hash("DueñoDeLoSuyo1", 12);
    const owner = await prisma.user.upsert({
      where: { email: "dueno-inventario@example.com" },
      update: { passwordHash: hash, role: "user", activatedAt: new Date() },
      create: { email: "dueno-inventario@example.com", passwordHash: hash, role: "user", activatedAt: new Date() },
    });
    const other = await prisma.workspace.create({ data: { name: "Cliente ACME (inventario)" } });
    otherWorkspaceId = other.id;
    await prisma.workspaceMember.create({ data: { workspaceId: other.id, userId: owner.id, role: "owner" } });
    deletedWorkspaceId = (await prisma.workspace.create({ data: { name: "Borrado (inventario)", deletedAt: new Date() } })).id;

    adminToken = (
      await request(app).post("/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    ).body.accessToken;
    ownerToken = (
      await request(app).post("/auth/login").send({ email: "dueno-inventario@example.com", password: "DueñoDeLoSuyo1" })
    ).body.accessToken;
  });

  afterAll(async () => {
    const ids = [otherWorkspaceId, deletedWorkspaceId];
    // Los logs y las claves referencian al espacio: se borran antes que el.
    await prisma.log.deleteMany({ where: { workspaceId: { in: ids } } });
    await prisma.apiKey.deleteMany({ where: { workspaceId: { in: ids } } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: otherWorkspaceId } });
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: "dueno-inventario@example.com" } });
    await prisma.$disconnect();
  });

  describe("Acceso", () => {
    it("sin sesion responde 401", async () => {
      expect((await request(app).get("/api/admin/keys")).status).toBe(401);
      expect((await request(app).delete("/api/admin/keys/1")).status).toBe(401);
    });

    it("el dueño de un espacio sin rol de plataforma recibe 403", async () => {
      const res = await request(app).get("/api/admin/keys").set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
      const del = await request(app).delete("/api/admin/keys/1").set("Authorization", `Bearer ${ownerToken}`);
      expect(del.status).toBe(403);
    });

    it("una API key nunca entra, ni siquiera una de lectura", async () => {
      const { key } = await createApiKey({ workspaceId: defaultWorkspaceId, name: "intrusa", scopes: ["read", "ingest", "metrics"] });
      const bearer = await request(app).get("/api/admin/keys").set("Authorization", `Bearer ${key}`);
      const header = await request(app).get("/api/admin/keys").set("x-api-key", key);
      expect(bearer.status).toBe(401);
      expect(header.status).toBe(401);
    });
  });

  describe("Contenido", () => {
    it("lista las claves de todos los espacios vigentes con su espacio, creador, estado y riesgos, sin el hash", async () => {
      const mine = await createApiKey({ workspaceId: defaultWorkspaceId, name: "principal lectura", scopes: ["read"] });
      const theirs = await createApiKey({
        workspaceId: otherWorkspaceId,
        name: "acme ingesta",
        scopes: ["ingest"],
        applications: ["facturacion"],
      });
      const gone = await createApiKey({ workspaceId: deletedWorkspaceId, name: "de un espacio borrado", scopes: ["read"] });

      const res = await inventory();
      expect(res.status).toBe(200);

      const principal = findKey(res.body, mine.apiKey.id)!;
      expect(principal.workspace).toEqual({ id: defaultWorkspaceId, name: expect.any(String) });
      expect(principal.status).toBe("active");
      expect(principal.risks).toEqual(["read-unrestricted", "read-no-expiry"]);

      const acme = findKey(res.body, theirs.apiKey.id)!;
      expect(acme.workspace).toEqual({ id: otherWorkspaceId, name: "Cliente ACME (inventario)" });
      expect(acme.risks).toEqual([]);

      expect(findKey(res.body, gone.apiKey.id)).toBeUndefined();
      for (const key of res.body.data) {
        expect(key).not.toHaveProperty("keyHash");
        expect(JSON.stringify(key)).not.toContain(mine.key);
      }

      expect(res.body.thresholds).toEqual(INVENTORY_THRESHOLDS);
      expect(res.body.legacyKey).toEqual({ enabled: config.apiKey !== "change-me" });
      expect(res.body.summary.workspaces).toBeGreaterThanOrEqual(2);
    });

    it("muestra quien creo la clave", async () => {
      const created = await request(app)
        .post("/api/keys")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Workspace-Id", String(defaultWorkspaceId))
        .send({ name: "creada desde el panel", scopes: ["ingest"], applications: ["ventas"] });
      expect(created.status).toBe(201);

      const key = findKey((await inventory()).body, created.body.apiKey.id)!;
      expect(key.createdBy).toEqual({ id: expect.any(Number), email: process.env.ADMIN_EMAIL });
    });
  });

  describe("Uso por MCP", () => {
    it("el MCP anota lastMcpUsedAt; la API REST solo lastUsedAt", async () => {
      resetApiKeyCaches();
      const assistant = await createApiKey({ workspaceId: defaultWorkspaceId, name: "asistente", scopes: ["read"] });
      const script = await createApiKey({ workspaceId: defaultWorkspaceId, name: "script", scopes: ["read"] });

      const mcp = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${assistant.key}`)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      expect(mcp.status).toBe(200);
      const rest = await request(app).get("/api/logs").set("x-api-key", script.key);
      expect(rest.status).toBe(200);

      // Las marcas se escriben sin esperar a la peticion: se espera a que lleguen.
      const settled = async () => {
        for (let attempt = 0; attempt < 50; attempt++) {
          const rows = await prisma.apiKey.findMany({ where: { id: { in: [assistant.apiKey.id, script.apiKey.id] } } });
          if (rows.every((row) => row.lastUsedAt) && rows.some((row) => row.lastMcpUsedAt)) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      };
      await settled();

      const res = await inventory();
      const viaMcp = findKey(res.body, assistant.apiKey.id)!;
      const viaRest = findKey(res.body, script.apiKey.id)!;
      expect(viaMcp.lastUsedAt).not.toBeNull();
      expect(viaMcp.lastMcpUsedAt).not.toBeNull();
      expect(viaRest.lastUsedAt).not.toBeNull();
      expect(viaRest.lastMcpUsedAt).toBeNull();
      expect(res.body.summary.mcpActive).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Revocar desde el inventario", () => {
    it("revoca una clave de otro espacio al instante, y deja de servir", async () => {
      const { key, apiKey } = await createApiKey({
        workspaceId: otherWorkspaceId,
        name: "acme filtrada",
        scopes: ["ingest"],
        applications: ["facturacion"],
      });
      const log = { application: "facturacion", level: "info", environment: "production", message: "antes" };
      expect((await request(app).post("/api/log").set("x-api-key", key).send(log)).status).toBe(201);

      const res = await request(app).delete(`/api/admin/keys/${apiKey.id}`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.revokedAt).not.toBeNull();
      expect(res.body.data).not.toHaveProperty("keyHash");

      expect((await request(app).post("/api/log").set("x-api-key", key).send(log)).status).toBe(401);
      expect(findKey((await inventory()).body, apiKey.id)!.status).toBe("revoked");
    });

    it("es idempotente: revocar otra vez conserva la fecha original", async () => {
      const { apiKey } = await createApiKey({ workspaceId: otherWorkspaceId, name: "doble", scopes: ["read"] });
      const first = await request(app).delete(`/api/admin/keys/${apiKey.id}`).set("Authorization", `Bearer ${adminToken}`);
      const second = await request(app).delete(`/api/admin/keys/${apiKey.id}`).set("Authorization", `Bearer ${adminToken}`);
      expect(second.status).toBe(200);
      expect(second.body.data.revokedAt).toBe(first.body.data.revokedAt);
    });

    it("404 si no existe o es de un espacio borrado, 400 si el id no es valido", async () => {
      const gone = await createApiKey({ workspaceId: deletedWorkspaceId, name: "borrada", scopes: ["read"] });
      const auth = { Authorization: `Bearer ${adminToken}` };
      expect((await request(app).delete("/api/admin/keys/999999999").set(auth)).status).toBe(404);
      expect((await request(app).delete(`/api/admin/keys/${gone.apiKey.id}`).set(auth)).status).toBe(404);
      expect((await request(app).delete("/api/admin/keys/abc").set(auth)).status).toBe(400);
      expect((await request(app).delete("/api/admin/keys/0").set(auth)).status).toBe(400);
    });
  });
});
