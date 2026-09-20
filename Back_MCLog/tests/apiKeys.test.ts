import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { createApiKey, resetApiKeyCaches } from "../src/services/apiKeyService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();

let adminToken: string;
let plainUserToken: string;

/** Crea una clave por la API de administracion y devuelve el secreto en claro. */
const createKeyViaApi = async (payload: Record<string, unknown>) => {
  const res = await request(app).post("/api/keys").set("Authorization", `Bearer ${adminToken}`).send(payload);
  expect(res.status).toBe(201);
  return { key: res.body.key as string, id: res.body.apiKey.id as number };
};

const sampleLog = (application: string) => ({
  application,
  level: "error",
  environment: "production",
  message: `fallo en ${application}`,
});

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.apiKey.deleteMany();
  await prisma.log.deleteMany();
  resetApiKeyCaches();

  const adminLogin = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  adminToken = adminLogin.body.accessToken;

  // Usuario sin rol admin, para comprobar que no puede administrar claves.
  const hash = await bcrypt.hash("SoloLectura1", 12);
  await prisma.user.upsert({
    where: { email: "lector@example.com" },
    update: { passwordHash: hash, role: "user" },
    create: { email: "lector@example.com", passwordHash: hash, role: "user" },
  });
  const userLogin = await request(app)
    .post("/auth/login")
    .send({ email: "lector@example.com", password: "SoloLectura1" });
  plainUserToken = userLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Administracion de API keys", () => {
  it("requiere sesion para listar claves", async () => {
    const res = await request(app).get("/api/keys");
    expect(res.status).toBe(401);
  });

  it("requiere rol admin para crear claves", async () => {
    const res = await request(app)
      .post("/api/keys")
      .set("Authorization", `Bearer ${plainUserToken}`)
      .send({ name: "intento", scopes: ["read"] });
    expect(res.status).toBe(403);
  });

  it("rechaza scopes desconocidos", async () => {
    const res = await request(app)
      .post("/api/keys")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "mala", scopes: ["superuser"] });
    expect(res.status).toBe(400);
  });

  it("devuelve el secreto solo al crear y nunca al listar", async () => {
    const { key, id } = await createKeyViaApi({ name: "visible una vez", scopes: ["read"] });
    expect(key).toMatch(/^mclog_[0-9a-f]{8}_/);

    const list = await request(app).get("/api/keys").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const stored = list.body.data.find((item: { id: number }) => item.id === id);
    expect(stored).toBeTruthy();
    expect(stored).not.toHaveProperty("keyHash");
    expect(JSON.stringify(list.body)).not.toContain(key);
  });
});

describe("Scopes de las API keys", () => {
  it("una clave de ingesta escribe logs pero no puede consultarlos", async () => {
    const { key } = await createKeyViaApi({ name: "emisor", scopes: ["ingest"] });

    const write = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("emisor-app"));
    expect(write.status).toBe(201);

    const read = await request(app).get("/api/logs").set("x-api-key", key);
    expect(read.status).toBe(403);
    expect(read.body).not.toHaveProperty("data");
  });

  it("una clave de lectura consulta pero no puede escribir", async () => {
    const { key } = await createKeyViaApi({ name: "lector", scopes: ["read"] });

    const read = await request(app).get("/api/logs").set("x-api-key", key);
    expect(read.status).toBe(200);
    expect(Array.isArray(read.body.data)).toBe(true);

    const write = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("otra"));
    expect(write.status).toBe(403);
  });

  it("acepta la clave en Authorization: Bearer, como hacen los clientes MCP", async () => {
    const { key } = await createKeyViaApi({ name: "bearer", scopes: ["read"] });
    const res = await request(app).get("/api/logs").set("Authorization", `Bearer ${key}`);
    expect(res.status).toBe(200);
  });

  it("protege /metrics con el scope metrics", async () => {
    const { key: sinScope } = await createKeyViaApi({ name: "sin metricas", scopes: ["read"] });
    const denegado = await request(app).get("/metrics").set("x-api-key", sinScope);
    expect(denegado.status).toBe(403);

    const { key: conScope } = await createKeyViaApi({ name: "con metricas", scopes: ["metrics"] });
    const ok = await request(app).get("/metrics").set("x-api-key", conScope);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("nodejs_version_info");
  });

  it("mantiene viva la clave heredada de API_KEY para no romper los emisores desplegados", async () => {
    const res = await request(app).post("/api/log").set("x-api-key", config.apiKey).send(sampleLog("netsuite"));
    expect(res.status).toBe(201);
  });

  it("rechaza una clave inexistente o mal formada", async () => {
    const inventada = await request(app)
      .post("/api/log")
      .set("x-api-key", "mclog_abcdef12_inventada")
      .send(sampleLog("x"));
    expect(inventada.status).toBe(401);

    const basura = await request(app).post("/api/log").set("x-api-key", "basura").send(sampleLog("x"));
    expect(basura.status).toBe(401);
  });
});

describe("Restriccion por aplicacion", () => {
  it("impide escribir logs de aplicaciones fuera del alcance de la clave", async () => {
    const { key } = await createKeyViaApi({
      name: "solo facturacion",
      scopes: ["ingest"],
      applications: ["facturacion"],
    });

    const permitido = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("facturacion"));
    expect(permitido.status).toBe(201);

    const prohibido = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("ventas"));
    expect(prohibido.status).toBe(403);
    expect(prohibido.body.allowedApplications).toEqual(["facturacion"]);

    // Basta con que un lote contenga una entrada fuera de alcance para rechazarlo entero.
    const lote = await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", key)
      .send({ logs: [sampleLog("facturacion"), sampleLog("ventas")] });
    expect(lote.status).toBe(403);
  });

  it("limita la consulta, las estadisticas y el detalle a las aplicaciones permitidas", async () => {
    await request(app).post("/api/log").set("Authorization", `Bearer ${adminToken}`).send(sampleLog("facturacion"));
    const ajeno = await request(app)
      .post("/api/log")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(sampleLog("ventas"));
    expect(ajeno.status).toBe(201);

    const { key } = await createKeyViaApi({
      name: "lectura facturacion",
      scopes: ["read"],
      applications: ["facturacion"],
    });

    const listado = await request(app).get("/api/logs?pageSize=200").set("x-api-key", key);
    expect(listado.status).toBe(200);
    expect(listado.body.total).toBeGreaterThan(0);
    const aplicaciones: string[] = listado.body.data.map((item: { application: string }) => item.application);
    expect(new Set(aplicaciones)).toEqual(new Set(["facturacion"]));

    // El filtro de la clave no se puede eludir pidiendo explicitamente otra aplicacion.
    const evasion = await request(app).get("/api/logs?application=ventas").set("x-api-key", key);
    expect(evasion.status).toBe(200);
    expect(evasion.body.total).toBe(0);

    const stats = await request(app).get("/api/logs/stats").set("x-api-key", key);
    expect(stats.status).toBe(200);
    expect(stats.body.byApplication.map((a: { application: string }) => a.application)).toEqual(["facturacion"]);

    // Un log de otra aplicacion responde 404, no 403: un 403 confirmaria que existe.
    const detalle = await request(app).get(`/api/logs/${ajeno.body.id}`).set("x-api-key", key);
    expect(detalle.status).toBe(404);
  });
});

describe("Ciclo de vida de las claves", () => {
  it("deja de aceptar una clave revocada", async () => {
    const { key, id } = await createKeyViaApi({ name: "efimera", scopes: ["ingest"] });
    const antes = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("app"));
    expect(antes.status).toBe(201);

    const revoke = await request(app).delete(`/api/keys/${id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.revokedAt).toBeTruthy();

    const despues = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("app"));
    expect(despues.status).toBe(401);
  });

  it("deja de aceptar una clave caducada", async () => {
    const { key } = await createApiKey({
      name: "caducada",
      scopes: ["ingest"],
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).post("/api/log").set("x-api-key", key).send(sampleLog("app"));
    expect(res.status).toBe(401);
  });

  it("devuelve 404 al revocar una clave inexistente", async () => {
    const res = await request(app).delete("/api/keys/999999").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
