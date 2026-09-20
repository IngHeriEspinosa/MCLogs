import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { evaluateRules } from "../src/alerts/evaluator";
import { notifiers, resetNotifiers } from "../src/alerts/notifiers";
import type { AlertPayload } from "../src/alerts/types";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
let adminToken: string;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

/** Avisos entregados por el notificador falso durante un test. */
let entregados: AlertPayload[] = [];
/** Si es true, el notificador falso falla, para probar el camino de error. */
let fallarEnvio = false;

const crearCanal = async (name = "canal de prueba") =>
  prisma.alertChannel.create({
    data: { name, type: "webhook", config: { url: "https://ejemplo.invalid/hook" } },
  });

const crearRegla = async (channelId: number, overrides: Record<string, unknown> = {}) =>
  prisma.alertRule.create({
    data: {
      name: "errores de facturacion",
      application: "facturacion",
      level: "error",
      threshold: 3,
      windowMinutes: 10,
      cooldownMinutes: 30,
      channels: { connect: [{ id: channelId }] },
      ...overrides,
    },
    include: { channels: true },
  });

const insertarErrores = (cuantos: number, overrides: Record<string, unknown> = {}) =>
  prisma.log.createMany({
    data: Array.from({ length: cuantos }, (_, indice) => ({
      application: "facturacion",
      service: "pagos",
      level: "error" as const,
      environment: "production" as const,
      message: `fallo ${indice}`,
      timestamp: new Date(),
      ...overrides,
    })),
  });

beforeAll(async () => {
  await ensureAdminUser();
  const login = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  adminToken = login.body.accessToken;
});

beforeEach(async () => {
  entregados = [];
  fallarEnvio = false;
  // Se sustituyen los tres notificadores: ningun test debe salir a la red.
  const falso = async (_channel: unknown, payload: AlertPayload) => {
    if (fallarEnvio) throw new Error("canal caido");
    entregados.push(payload);
  };
  notifiers.webhook = falso;
  notifiers.email = falso;
  notifiers.telegram = falso;

  await prisma.alertEvent.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.alertChannel.deleteMany();
  await prisma.log.deleteMany();
});

afterEach(() => {
  resetNotifiers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Evaluacion de reglas de umbral", () => {
  it("no avisa por debajo del umbral", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id);
    await insertarErrores(2);

    expect(await evaluateRules()).toBe(0);
    expect(entregados).toHaveLength(0);
  });

  it("avisa al alcanzar el umbral y registra el disparo", async () => {
    const canal = await crearCanal();
    const regla = await crearRegla(canal.id);
    await insertarErrores(3);

    expect(await evaluateRules()).toBe(1);
    expect(entregados).toHaveLength(1);
    expect(entregados[0].count).toBe(3);
    expect(entregados[0].rule.name).toBe("errores de facturacion");
    expect(entregados[0].samples.length).toBeGreaterThan(0);

    const eventos = await prisma.alertEvent.findMany({ where: { ruleId: regla.id } });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].count).toBe(3);
    expect((eventos[0].deliveries as Array<{ ok: boolean }>)[0].ok).toBe(true);
  });

  it("respeta el cooldown y vuelve a avisar cuando expira", async () => {
    const canal = await crearCanal();
    const regla = await crearRegla(canal.id, { cooldownMinutes: 30 });
    await insertarErrores(3);

    expect(await evaluateRules()).toBe(1);
    // Inmediatamente despues no debe repetir el aviso.
    expect(await evaluateRules()).toBe(0);
    expect(entregados).toHaveLength(1);

    // Se envejece el ultimo disparo mas alla del cooldown.
    await prisma.alertRule.update({
      where: { id: regla.id },
      data: { lastTriggeredAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    expect(await evaluateRules()).toBe(1);
    expect(entregados).toHaveLength(2);
  });

  it("ignora los logs fuera de la ventana", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { windowMinutes: 5 });
    await insertarErrores(3, { timestamp: new Date(Date.now() - 60 * 60 * 1000) });

    expect(await evaluateRules()).toBe(0);
  });

  it("solo cuenta la aplicacion y el nivel de la regla", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { threshold: 1 });

    await insertarErrores(3, { application: "ventas" });
    expect(await evaluateRules()).toBe(0);

    await insertarErrores(3, { level: "info" });
    expect(await evaluateRules()).toBe(0);

    await insertarErrores(1);
    expect(await evaluateRules()).toBe(1);
  });

  it("no evalua las reglas desactivadas", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { enabled: false, threshold: 1 });
    await insertarErrores(5);

    expect(await evaluateRules()).toBe(0);
  });

  it("no envia por canales desactivados", async () => {
    const canal = await prisma.alertChannel.create({
      data: { name: "apagado", type: "webhook", config: { url: "https://x.invalid" }, enabled: false },
    });
    await crearRegla(canal.id, { threshold: 1 });
    await insertarErrores(1);

    expect(await evaluateRules()).toBe(1);
    expect(entregados).toHaveLength(0);
  });
});

describe("Errores nuevos", () => {
  it("detecta una huella que aparece por primera vez en la ventana", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "new_error_group", threshold: 1, windowMinutes: 10 });

    // Un error que ya existia antes de la ventana no cuenta como nuevo.
    await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .send({
        application: "facturacion",
        level: "error",
        environment: "production",
        message: "Fallo antiguo conocido",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
    expect(await evaluateRules()).toBe(0);

    // Uno que nunca se habia visto, si.
    await request(app).post("/api/log").set("x-api-key", config.apiKey).send({
      application: "facturacion",
      level: "error",
      environment: "production",
      message: "Fallo recien aparecido",
    });

    expect(await evaluateRules()).toBe(1);
    expect(entregados[0].rule.type).toBe("new_error_group");
    expect(entregados[0].count).toBe(1);
  });
});

describe("Fallos de entrega", () => {
  it("registra el fallo sin romper la evaluacion ni bloquear el cooldown", async () => {
    fallarEnvio = true;
    const canal = await crearCanal();
    const regla = await crearRegla(canal.id, { threshold: 1 });
    await insertarErrores(1);

    // El disparo ocurre igualmente: lo que falla es el envio, no la regla.
    expect(await evaluateRules()).toBe(1);

    const evento = await prisma.alertEvent.findFirstOrThrow({ where: { ruleId: regla.id } });
    const entregas = evento.deliveries as Array<{ ok: boolean; error?: string }>;
    expect(entregas[0].ok).toBe(false);
    expect(entregas[0].error).toContain("canal caido");

    // Y el cooldown arranca: reintentar cada minuto contra un canal caido solo
    // multiplicaria el ruido cuando vuelva.
    expect(await evaluateRules()).toBe(0);
  });
});

describe("API de alertas", () => {
  it("exige rol admin", async () => {
    const res = await request(app).get("/api/alerts/channels");
    expect(res.status).toBe(401);
  });

  it("crea, lista y borra canales enmascarando los secretos", async () => {
    const creado = await request(app)
      .post("/api/alerts/channels")
      .set(auth())
      .send({ name: "slack", type: "webhook", config: { url: "https://hooks.slack.com/x", secret: "s3cr3to" } });
    expect(creado.status).toBe(201);
    expect(creado.body.data.config.secret).toBe("********");

    const lista = await request(app).get("/api/alerts/channels").set(auth());
    expect(lista.status).toBe(200);
    expect(JSON.stringify(lista.body)).not.toContain("s3cr3to");

    const borrado = await request(app).delete(`/api/alerts/channels/${creado.body.data.id}`).set(auth());
    expect(borrado.status).toBe(200);
  });

  it("conserva el secreto al editar con la mascara puesta", async () => {
    const creado = await request(app)
      .post("/api/alerts/channels")
      .set(auth())
      .send({ name: "hook", type: "webhook", config: { url: "https://x.invalid/a", secret: "original" } });

    // La interfaz devuelve la mascara tal cual la recibio; no debe borrar el secreto.
    await request(app)
      .patch(`/api/alerts/channels/${creado.body.data.id}`)
      .set(auth())
      .send({ name: "hook renombrado", config: { url: "https://x.invalid/b", secret: "********" } });

    const guardado = await prisma.alertChannel.findUniqueOrThrow({ where: { id: creado.body.data.id } });
    const guardadoConfig = guardado.config as { url: string; secret: string };
    expect(guardadoConfig.secret).toBe("original");
    expect(guardadoConfig.url).toBe("https://x.invalid/b");
  });

  it("valida la configuracion segun el tipo de canal", async () => {
    const sinUrl = await request(app)
      .post("/api/alerts/channels")
      .set(auth())
      .send({ name: "malo", type: "webhook", config: {} });
    expect(sinUrl.status).toBe(400);

    const sinDestinatarios = await request(app)
      .post("/api/alerts/channels")
      .set(auth())
      .send({ name: "malo", type: "email", config: { to: [] } });
    expect(sinDestinatarios.status).toBe(400);
  });

  it("envia un aviso de prueba y devuelve su resultado", async () => {
    const canal = await crearCanal();
    const ok = await request(app).post(`/api/alerts/channels/${canal.id}/test`).set(auth());
    expect(ok.status).toBe(200);
    expect(ok.body.data.ok).toBe(true);
    expect(entregados).toHaveLength(1);

    // Un canal que falla se informa con 200 y ok:false: el fallo es el dato pedido.
    fallarEnvio = true;
    const fallo = await request(app).post(`/api/alerts/channels/${canal.id}/test`).set(auth());
    expect(fallo.status).toBe(200);
    expect(fallo.body.data.ok).toBe(false);
  });

  it("crea reglas enlazadas a canales y permite cambiar la lista", async () => {
    const uno = await crearCanal("uno");
    const dos = await crearCanal("dos");

    const creada = await request(app)
      .post("/api/alerts/rules")
      .set(auth())
      .send({ name: "regla", application: "facturacion", threshold: 5, channelIds: [uno.id] });
    expect(creada.status).toBe(201);
    expect(creada.body.data.channels).toHaveLength(1);

    const actualizada = await request(app)
      .patch(`/api/alerts/rules/${creada.body.data.id}`)
      .set(auth())
      .send({ channelIds: [dos.id], threshold: 9 });
    expect(actualizada.status).toBe(200);
    expect(actualizada.body.data.threshold).toBe(9);
    expect(actualizada.body.data.channels.map((c: { name: string }) => c.name)).toEqual(["dos"]);
  });

  it("devuelve el historial de disparos", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { threshold: 1 });
    await insertarErrores(1);
    await evaluateRules();

    const res = await request(app).get("/api/alerts/events").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].rule.name).toBe("errores de facturacion");
  });
});
