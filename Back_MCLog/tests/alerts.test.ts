import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { getDefaultWorkspaceId } from "../src/services/workspaceService";
import { dashboardLink, evaluateRules } from "../src/alerts/evaluator";
import { Digest, digestSenders, isDigestDue, runDigestsNow } from "../src/alerts/digest";
import { notifiers, resetNotifiers } from "../src/alerts/notifiers";
import type { AlertPayload } from "../src/alerts/types";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
let adminToken: string;
/** Espacio del admin, donde el panel crea todo por defecto. */
let workspaceId: number;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

/** Avisos entregados por el notificador falso durante un test. */
let entregados: AlertPayload[] = [];
/** Si es true, el notificador falso falla, para probar el camino de error. */
let fallarEnvio = false;

const crearCanal = async (name = "canal de prueba") =>
  prisma.alertChannel.create({
    data: { workspaceId, name, type: "webhook", config: { url: "https://ejemplo.invalid/hook" } },
  });

const crearRegla = async (channelId: number, overrides: Record<string, unknown> = {}) =>
  prisma.alertRule.create({
    data: {
      workspaceId,
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
      workspaceId,
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
  workspaceId = (await getDefaultWorkspaceId())!;
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
      data: { workspaceId, name: "apagado", type: "webhook", config: { url: "https://x.invalid" }, enabled: false },
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
    expect(entregados[0].samples[0].fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("cuenta todos los grupos nuevos, aunque pasen de 50", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "new_error_group", threshold: 60, windowMinutes: 10 });
    await prisma.log.createMany({
      data: Array.from({ length: 60 }, (_, indice) => ({
        workspaceId,
        application: "facturacion",
        level: "error" as const,
        environment: "production" as const,
        message: `fallo distinto ${indice}`,
        fingerprint: `grupo-${indice}`,
        timestamp: new Date(),
      })),
    });

    expect(await evaluateRules()).toBe(1);
    expect(entregados[0].count).toBe(60);
    // Las muestras siguen siendo unas pocas.
    expect(entregados[0].samples.length).toBeLessThanOrEqual(5);
  });

  it("avisa de lo que aparecio mientras la regla estaba en cooldown", async () => {
    const canal = await crearCanal();
    const ahora = new Date();
    // Avisó hace 40 min, con 30 de cooldown y 10 de ventana: el grupo de hace
    // 20 minutos ya no está en la ventana, pero nunca se avisó.
    await crearRegla(canal.id, {
      type: "new_error_group",
      threshold: 1,
      windowMinutes: 10,
      cooldownMinutes: 30,
      lastTriggeredAt: new Date(ahora.getTime() - 40 * 60 * 1000),
    });
    await insertarErrores(1, { fingerprint: "surgio-en-cooldown", timestamp: new Date(ahora.getTime() - 20 * 60 * 1000) });

    expect(await evaluateRules(ahora)).toBe(1);
    expect(entregados[0].count).toBe(1);
  });
});

describe("Fechas y enlace del aviso", () => {
  it("un log con fecha futura no cuenta hasta que llega su hora", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { threshold: 1 });
    await insertarErrores(3, { timestamp: new Date(Date.now() + 60 * 60 * 1000) });
    expect(await evaluateRules()).toBe(0);
  });

  it("el enlace reproduce la ventana, los niveles, el servicio y la huella", () => {
    const original = config.publicDashboardUrl;
    config.publicDashboardUrl = "https://panel.example.com";
    try {
      const from = new Date("2026-10-01T10:00:00.000Z");
      const to = new Date("2026-10-01T10:10:00.000Z");
      const rule = { workspaceId: 7, level: "warn", application: "facturacion", service: "pagos", environment: "production" };
      const url = new URL(dashboardLink(rule as never, { from, to }, "abc")!);
      expect(url.pathname).toBe("/logs");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        ws: "7",
        level: "warn,error",
        from: from.toISOString(),
        to: to.toISOString(),
        application: "facturacion",
        service: "pagos",
        environment: "production",
        fingerprint: "abc",
      });
    } finally {
      config.publicDashboardUrl = original;
    }
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

describe("Tipos de regla con estado", () => {
  beforeEach(async () => {
    await prisma.errorGroup.deleteMany();
  });

  it("umbral: avisa al dispararse y otra vez al recuperarse", async () => {
    const canal = await crearCanal();
    const regla = await crearRegla(canal.id, { threshold: 3, windowMinutes: 10 });
    await insertarErrores(3);
    expect(await evaluateRules()).toBe(1);
    expect((await prisma.alertRule.findUniqueOrThrow({ where: { id: regla.id } })).state).toBe("firing");

    // Fuera de la ventana: la condicion se despeja.
    await prisma.log.deleteMany();
    expect(await evaluateRules()).toBe(0);
    expect(entregados.map((aviso) => aviso.kind)).toEqual(["trigger", "resolve"]);
    expect((await prisma.alertRule.findUniqueOrThrow({ where: { id: regla.id } })).state).toBe("ok");
    const eventos = await prisma.alertEvent.findMany({ where: { ruleId: regla.id }, orderBy: { id: "asc" } });
    expect(eventos.map((evento) => evento.kind)).toEqual(["trigger", "resolve"]);
  });

  it("una regla silenciada no se evalua", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { threshold: 1, mutedUntil: new Date(Date.now() + 3600 * 1000) });
    await insertarErrores(5);
    expect(await evaluateRules()).toBe(0);
    expect(entregados).toHaveLength(0);
  });

  it("tasa de error: dispara con el porcentaje y respeta el volumen minimo", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "error_rate", threshold: 20, minVolume: 10 });
    await insertarErrores(3);
    await insertarErrores(7, { level: "info" });
    expect(await evaluateRules()).toBe(1);
    expect(entregados[0].summary).toContain("30 % de errores (3 de 10");

    await prisma.alertRule.updateMany({ data: { minVolume: 50, lastTriggeredAt: null, state: "ok" } });
    entregados = [];
    expect(await evaluateRules()).toBe(0);
  });

  it("silencio: avisa si algo que emitia la semana pasada deja de hacerlo", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "silence", windowMinutes: 60 });
    // Sin actividad previa no hay latido que echar de menos.
    expect(await evaluateRules()).toBe(0);

    await insertarErrores(1, { level: "info", timestamp: new Date(Date.now() - 3 * 3600 * 1000) });
    expect(await evaluateRules()).toBe(1);
    expect(entregados[0].rule.type).toBe("silence");

    // Vuelve a emitir: se recupera.
    await insertarErrores(1, { level: "info" });
    await evaluateRules();
    expect(entregados.at(-1)?.kind).toBe("resolve");
  });

  it("pico: compara la ventana con la media de la semana anterior", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "spike", threshold: 3, windowMinutes: 60, minVolume: 5 });
    // Una semana tranquila: 14 errores en 7 dias (2 al dia, menos de 1 por hora).
    for (let dia = 1; dia <= 7; dia++) {
      await insertarErrores(2, { timestamp: new Date(Date.now() - dia * 24 * 3600 * 1000) });
    }
    await insertarErrores(4);
    expect(await evaluateRules()).toBe(0);
    await insertarErrores(4);
    expect(await evaluateRules()).toBe(1);
    expect(entregados[0].summary).toMatch(/× lo normal/);
  });

  it("regresion: avisa cuando un fallo resuelto vuelve", async () => {
    const canal = await crearCanal();
    await crearRegla(canal.id, { type: "regression", threshold: 1 });
    await prisma.errorGroup.create({
      data: {
        workspaceId,
        fingerprint: "volvio",
        application: "facturacion",
        level: "error",
        firstSeen: new Date(Date.now() - 24 * 3600 * 1000),
        lastSeen: new Date(),
        status: "active",
        regressionCount: 1,
        lastRegressedAt: new Date(),
      },
    });
    await insertarErrores(1, { fingerprint: "volvio" });

    expect(await evaluateRules()).toBe(1);
    expect(entregados[0]).toMatchObject({ count: 1, kind: "trigger" });
    expect(entregados[0].samples[0].fingerprint).toBe("volvio");
  });
});

describe("Resumenes programados", () => {
  it("decide cuando toca cada uno", () => {
    const lunes9 = new Date("2026-10-05T09:10:00.000Z");
    const base = { hourUtc: 9, weekday: 1, lastSentAt: null };
    expect(isDigestDue({ ...base, frequency: "daily" }, lunes9)).toBe(true);
    expect(isDigestDue({ ...base, frequency: "weekly" }, lunes9)).toBe(true);
    expect(isDigestDue({ ...base, frequency: "weekly", weekday: 2 }, lunes9)).toBe(false);
    expect(isDigestDue({ ...base, frequency: "daily", hourUtc: 8 }, lunes9)).toBe(false);
    // Ya salio en esta hora.
    expect(isDigestDue({ ...base, frequency: "daily", lastSentAt: new Date("2026-10-05T09:02:00.000Z") }, lunes9)).toBe(false);
  });

  it("envia los que tocan por sus canales y lo anota", async () => {
    const canal = await crearCanal();
    const enviados: Digest[] = [];
    const original = digestSenders.webhook;
    digestSenders.webhook = async (_channel, digest) => {
      enviados.push(digest);
    };
    try {
      await insertarErrores(2);
      const ahora = new Date();
      const resumen = await prisma.digestSchedule.create({
        data: { workspaceId, name: "Diario", frequency: "daily", hourUtc: ahora.getUTCHours(), channels: { connect: [{ id: canal.id }] } },
      });

      expect(await runDigestsNow(ahora)).toBe(1);
      expect(enviados[0]).toMatchObject({ name: "Diario", totals: { error: 2 } });
      expect((await prisma.digestSchedule.findUniqueOrThrow({ where: { id: resumen.id } })).lastSentAt).not.toBeNull();
      // En la misma hora no se repite.
      expect(await runDigestsNow(ahora)).toBe(0);
    } finally {
      digestSenders.webhook = original;
      await prisma.digestSchedule.deleteMany();
    }
  });
});
