import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { createApiKey, resetApiKeyCaches } from "../src/services/apiKeyService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = new PrismaClient();

let readKey: string;
let scopedKey: string;
let ingestKey: string;

/** Los clientes MCP anuncian que aceptan ambos formatos de respuesta. */
const ACCEPT = "application/json, text/event-stream";

let requestId = 0;
const rpc = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id: ++requestId,
  method,
  ...(params ? { params } : {}),
});

/** Envia una peticion JSON-RPC al endpoint MCP con la clave indicada. */
const callMcp = (key: string, body: Record<string, unknown>) =>
  request(app).post("/mcp").set("Authorization", `Bearer ${key}`).set("Accept", ACCEPT).send(body);

/** Ejecuta una herramienta y devuelve su carga util ya parseada. */
const callTool = async (key: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await callMcp(key, rpc("tools/call", { name, arguments: args }));
  expect(res.status).toBe(200);
  const content = res.body.result?.content?.[0];
  expect(content?.type).toBe("text");
  return { isError: res.body.result?.isError === true, text: content.text as string };
};

const callToolJson = async (key: string, name: string, args: Record<string, unknown> = {}) => {
  const { isError, text } = await callTool(key, name, args);
  expect(isError).toBe(false);
  return JSON.parse(text);
};

const ingest = (payload: Record<string, unknown>) =>
  request(app).post("/api/log").set("x-api-key", config.apiKey).send(payload);

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.log.deleteMany();
  await prisma.apiKey.deleteMany();
  resetApiKeyCaches();

  readKey = (await createApiKey({ name: "mcp lectura", scopes: ["read"] })).key;
  scopedKey = (await createApiKey({ name: "mcp acotada", scopes: ["read"], applications: ["facturacion"] })).key;
  ingestKey = (await createApiKey({ name: "mcp ingesta", scopes: ["ingest"] })).key;

  const stack = "TypeError: x\n    at cobrar (/app/src/pagos.js:42:15)";
  for (const pedido of [1, 2, 3]) {
    await ingest({
      application: "facturacion",
      service: "pagos",
      level: "error",
      environment: "production",
      message: `Timeout cobrando el pedido ${pedido}`,
      errorStack: stack,
      error: { name: "TypeError", code: "ETIMEDOUT" },
      traceId: "traza-mcp",
      metadata: { pedido },
    });
  }
  await ingest({
    application: "ventas",
    level: "error",
    environment: "production",
    message: "Fallo de otra aplicacion",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Acceso al endpoint MCP", () => {
  it("rechaza las peticiones sin credenciales", async () => {
    const res = await request(app).post("/mcp").set("Accept", ACCEPT).send(rpc("tools/list"));
    expect(res.status).toBe(401);
  });

  it("rechaza una clave sin scope de lectura", async () => {
    const res = await callMcp(ingestKey, rpc("tools/list"));
    expect(res.status).toBe(403);
  });

  it("responde 405 a GET y DELETE, porque el endpoint es sin estado", async () => {
    const get = await request(app).get("/mcp").set("Authorization", `Bearer ${readKey}`);
    expect(get.status).toBe(405);
    expect(get.body.error.message).toContain("stateless");

    const del = await request(app).delete("/mcp").set("Authorization", `Bearer ${readKey}`);
    expect(del.status).toBe(405);
  });
});

describe("Protocolo MCP", () => {
  it("responde al handshake de inicializacion", async () => {
    const res = await callMcp(
      readKey,
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe("mclog");
    expect(res.body.result.instructions).toContain("get_error_groups");
  });

  it("publica las ocho herramientas con su descripcion", async () => {
    const res = await callMcp(readKey, rpc("tools/list"));
    expect(res.status).toBe(200);

    const nombres = res.body.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(nombres).toEqual([
      "get_error_groups",
      "get_log",
      "get_log_context",
      "get_recent_errors",
      "get_stats",
      "get_trace",
      "list_applications",
      "search_logs",
    ]);

    const grupos = res.body.result.tools.find((tool: { name: string }) => tool.name === "get_error_groups");
    expect(grupos.description).toBeTruthy();
    expect(grupos.inputSchema.properties).toHaveProperty("hours");
  });
});

describe("Herramientas de investigacion", () => {
  it("list_applications resume lo que emite logs", async () => {
    const data = await callToolJson(readKey, "list_applications");
    const aplicaciones = data.applications.map((app: { application: string }) => app.application);
    expect(aplicaciones).toContain("facturacion");
    expect(aplicaciones).toContain("ventas");
  });

  it("get_error_groups agrupa las ocurrencias del mismo fallo", async () => {
    const data = await callToolJson(readKey, "get_error_groups", { application: "facturacion" });
    const grupo = data.groups.find((g: { sampleMessage: string }) => g.sampleMessage.startsWith("Timeout cobrando"));

    expect(grupo.count).toBe(3);
    expect(grupo.errorName).toBe("TypeError");
    expect(grupo.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("search_logs baja del grupo a sus ocurrencias por la huella", async () => {
    const grupos = await callToolJson(readKey, "get_error_groups", { application: "facturacion" });
    const fingerprint = grupos.groups[0].fingerprint;

    const data = await callToolJson(readKey, "search_logs", { fingerprint });
    expect(data.total).toBe(3);
    expect(data.logs).toHaveLength(3);
  });

  it("search_logs devuelve los logs sin metadata, y get_log con ella", async () => {
    const busqueda = await callToolJson(readKey, "search_logs", { application: "facturacion", pageSize: 1 });
    const resumen = busqueda.logs[0];
    expect(resumen).not.toHaveProperty("metadata");
    expect(resumen).not.toHaveProperty("errorStack");

    const detalle = await callToolJson(readKey, "get_log", { id: resumen.id });
    expect(detalle.metadata).toHaveProperty("pedido");
    expect(detalle.errorStack).toContain("at cobrar");
  });

  it("get_trace devuelve la operacion completa", async () => {
    const data = await callToolJson(readKey, "get_trace", { traceId: "traza-mcp" });
    expect(data.total).toBe(3);
    expect(data.applications).toEqual(["facturacion"]);
  });

  it("get_log_context devuelve lo ocurrido alrededor", async () => {
    const busqueda = await callToolJson(readKey, "search_logs", { application: "facturacion", pageSize: 1 });
    const data = await callToolJson(readKey, "get_log_context", { id: busqueda.logs[0].id, beforeSeconds: 300 });

    expect(data.target.id).toBe(busqueda.logs[0].id);
    expect(data.total).toBeGreaterThan(1);
  });

  it("get_recent_errors mira una ventana corta", async () => {
    const data = await callToolJson(readKey, "get_recent_errors", { minutes: 60 });
    expect(data.total).toBeGreaterThan(0);
    expect(data.logs.every((log: { level: string }) => log.level === "error")).toBe(true);
  });

  it("get_stats incluye la serie temporal", async () => {
    const data = await callToolJson(readKey, "get_stats", { hours: 24 });
    expect(data.total).toBeGreaterThan(0);
    expect(Array.isArray(data.timeline)).toBe(true);
  });

  it("avisa cuando hay mas resultados de los devueltos", async () => {
    const data = await callToolJson(readKey, "search_logs", { pageSize: 1 });
    expect(data.hint).toContain("pagina 1 de");
  });

  it("devuelve un error legible, no una excepcion, si el log no existe", async () => {
    const { isError, text } = await callTool(readKey, "get_log", { id: 999999 });
    expect(isError).toBe(true);
    expect(text).toContain("999999");
  });

  it("valida los argumentos de las herramientas", async () => {
    const res = await callMcp(readKey, rpc("tools/call", { name: "get_log", arguments: { id: "no soy un numero" } }));
    // El error puede llegar como error JSON-RPC o como resultado marcado; en
    // cualquier caso no debe ejecutarse la consulta.
    const fallo = res.body.error !== undefined || res.body.result?.isError === true;
    expect(fallo).toBe(true);
  });
});

describe("Aislamiento por aplicacion en MCP", () => {
  it("una clave acotada no ve otras aplicaciones", async () => {
    const inventario = await callToolJson(scopedKey, "list_applications");
    expect(inventario.applications.map((a: { application: string }) => a.application)).toEqual(["facturacion"]);

    const busqueda = await callToolJson(scopedKey, "search_logs", { pageSize: 100 });
    const aplicaciones = new Set(busqueda.logs.map((log: { application: string }) => log.application));
    expect([...aplicaciones]).toEqual(["facturacion"]);
  });

  it("una clave acotada no alcanza un log de otra aplicacion ni por id", async () => {
    const todas = await callToolJson(readKey, "search_logs", { application: "ventas", pageSize: 1 });
    const idAjeno = todas.logs[0].id;

    const { isError } = await callTool(scopedKey, "get_log", { id: idAjeno });
    expect(isError).toBe(true);
  });

  it("anuncia su alcance en las instrucciones del servidor", async () => {
    const res = await callMcp(
      scopedKey,
      rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }),
    );
    expect(res.body.result.instructions).toContain("facturacion");
  });
});
