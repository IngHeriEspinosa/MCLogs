import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "net";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { createApiKey, resetApiKeyCaches } from "../src/services/apiKeyService";
import { activeStreamConnections } from "../src/controllers/streamController";
import { LOG_CREATED, logEvents } from "../src/events/logEvents";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = new PrismaClient();

let baseUrl: string;
let server: ReturnType<typeof app.listen>;
let readKey: string;
let scopedKey: string;

/**
 * Abre una conexión SSE real y recoge los eventos que lleguen.
 *
 * Supertest no sirve aquí: espera a que la respuesta termine, y un stream no
 * termina nunca. Hace falta un servidor de verdad y leer el cuerpo a trozos.
 */
const abrirStream = async (key: string, query = "") => {
  const controlador = new AbortController();
  const response = await fetch(`${baseUrl}/api/logs/stream${query}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "text/event-stream" },
    signal: controlador.signal,
  });

  const eventos: Array<{ event: string; data: Record<string, unknown> }> = [];

  if (response.body) {
    const lector = response.body.getReader();
    const decodificador = new TextDecoder();
    let pendiente = "";

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          pendiente += decodificador.decode(value, { stream: true });

          // Los mensajes SSE se separan por una línea en blanco.
          const bloques = pendiente.split("\n\n");
          pendiente = bloques.pop() ?? "";

          for (const bloque of bloques) {
            const nombre = /^event: (.+)$/m.exec(bloque)?.[1];
            const datos = /^data: (.+)$/m.exec(bloque)?.[1];
            if (nombre && datos) eventos.push({ event: nombre, data: JSON.parse(datos) });
          }
        }
      } catch {
        // Cierre esperado al abortar.
      }
    })();
  }

  return { response, eventos, cerrar: () => controlador.abort() };
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera hasta que se cumpla una condición, sin fijar un tiempo arbitrario. */
const esperarA = async (condicion: () => boolean, timeoutMs = 3000) => {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (condicion()) return true;
    await esperar(25);
  }
  return condicion();
};

const enviarLog = (payload: Record<string, unknown>) =>
  request(app).post("/api/log").set("x-api-key", config.apiKey).send(payload);

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.apiKey.deleteMany();
  resetApiKeyCaches();

  readKey = (await createApiKey({ name: "stream lectura", scopes: ["read"] })).key;
  scopedKey = (await createApiKey({ name: "stream acotada", scopes: ["read"], applications: ["facturacion"] })).key;

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

describe("Stream de logs en vivo", () => {
  it("exige credenciales de lectura", async () => {
    const res = await fetch(`${baseUrl}/api/logs/stream`);
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });

  it("anuncia la conexión y entrega los logs nuevos", async () => {
    const stream = await abrirStream(readKey);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toContain("text/event-stream");

    // El evento de bienvenida confirma que la conexión está viva.
    expect(await esperarA(() => stream.eventos.some((e) => e.event === "ready"))).toBe(true);

    await enviarLog({
      application: "facturacion",
      level: "error",
      environment: "production",
      message: "algo se rompio en vivo",
    });

    expect(await esperarA(() => stream.eventos.some((e) => e.event === "log"))).toBe(true);
    const entregado = stream.eventos.find((e) => e.event === "log")!.data;
    expect(entregado.message).toBe("algo se rompio en vivo");
    expect(entregado.application).toBe("facturacion");
    // El stream lleva lo justo: ni metadata ni stack.
    expect(entregado).not.toHaveProperty("metadata");

    stream.cerrar();
  });

  it("aplica los filtros de la consulta", async () => {
    const stream = await abrirStream(readKey, "?level=error");
    await esperarA(() => stream.eventos.some((e) => e.event === "ready"));

    await enviarLog({ application: "ventas", level: "info", environment: "production", message: "ruido" });
    await enviarLog({ application: "ventas", level: "error", environment: "production", message: "lo que importa" });

    expect(await esperarA(() => stream.eventos.some((e) => e.event === "log"))).toBe(true);
    await esperar(150);

    const mensajes = stream.eventos.filter((e) => e.event === "log").map((e) => e.data.message);
    expect(mensajes).toContain("lo que importa");
    expect(mensajes).not.toContain("ruido");

    stream.cerrar();
  });

  it("respeta el alcance de una clave acotada", async () => {
    const stream = await abrirStream(scopedKey);
    await esperarA(() => stream.eventos.some((e) => e.event === "ready"));

    await enviarLog({ application: "ventas", level: "error", environment: "production", message: "de otra app" });
    await enviarLog({ application: "facturacion", level: "error", environment: "production", message: "de la mia" });

    expect(await esperarA(() => stream.eventos.some((e) => e.event === "log"))).toBe(true);
    await esperar(150);

    const aplicaciones = stream.eventos.filter((e) => e.event === "log").map((e) => e.data.application);
    expect(new Set(aplicaciones)).toEqual(new Set(["facturacion"]));

    stream.cerrar();
  });

  it("entrega también los logs enviados en lote", async () => {
    const stream = await abrirStream(readKey);
    await esperarA(() => stream.eventos.some((e) => e.event === "ready"));

    await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", config.apiKey)
      .send({
        logs: [
          { application: "lote", level: "warn", environment: "production", message: "uno" },
          { application: "lote", level: "warn", environment: "production", message: "dos" },
        ],
      });

    expect(await esperarA(() => stream.eventos.filter((e) => e.event === "log").length >= 2)).toBe(true);
    stream.cerrar();
  });

  it("libera la conexión y su listener al cerrarse el cliente", async () => {
    // Los cierres de los tests anteriores llegan al servidor de forma
    // asíncrona, así que primero se espera a que el contador quede a cero.
    expect(await esperarA(() => activeStreamConnections() === 0)).toBe(true);

    const stream = await abrirStream(readKey);
    await esperarA(() => stream.eventos.some((e) => e.event === "ready"));
    expect(activeStreamConnections()).toBe(1);
    expect(logEvents.listenerCount(LOG_CREATED)).toBe(1);

    stream.cerrar();

    // Al cerrar se sueltan las dos cosas: el contador y el listener. Si el
    // listener quedara colgado, cada reconexión filtraría memoria.
    expect(await esperarA(() => activeStreamConnections() === 0)).toBe(true);
    expect(logEvents.listenerCount(LOG_CREATED)).toBe(0);
  });
});
