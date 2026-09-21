import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { config } from "../src/config/env";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
let token: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

const ingest = (payload: Record<string, unknown>) =>
  request(app).post("/api/log").set("x-api-key", config.apiKey).send(payload);

const STACK = ["TypeError: cannot read properties of undefined", "    at cobrar (/app/src/pagos.js:42:15)"].join("\n");

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.log.deleteMany();

  const login = await request(app).post("/auth/login").send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  token = login.body.accessToken;

  // Tres ocurrencias del mismo fallo con identificadores distintos: deben
  // acabar en un unico grupo.
  for (const pedido of [991, 1428, 77]) {
    await ingest({
      application: "facturacion",
      service: "pagos",
      level: "error",
      environment: "production",
      message: `Timeout cobrando el pedido ${pedido}`,
      errorStack: STACK,
      error: { name: "TypeError", code: "ETIMEDOUT" },
      traceId: "traza-comun",
    });
  }

  // Un fallo distinto en la misma aplicacion.
  await ingest({
    application: "facturacion",
    service: "pagos",
    level: "error",
    environment: "production",
    message: "Tarjeta rechazada",
  });

  // Ruido que no debe aparecer en los grupos de error.
  await ingest({
    application: "facturacion",
    service: "pagos",
    level: "info",
    environment: "production",
    message: "Cobro correcto",
    traceId: "traza-comun",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ingesta con detalle de error", () => {
  it("acepta un objeto error y lo vuelca en columnas propias", async () => {
    const res = await ingest({
      application: "ventas",
      level: "error",
      environment: "production",
      message: "Fallo al sincronizar",
      error: { name: "SyncError", code: 503, stack: STACK },
    });

    expect(res.status).toBe(201);
    expect(res.body.errorName).toBe("SyncError");
    // Un codigo numerico se guarda como texto, para que la columna sea uniforme.
    expect(res.body.errorCode).toBe("503");
    expect(res.body.errorStack).toContain("at cobrar");
    expect(res.body.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    // El objeto se vuelca y se descarta: no se duplica dentro del registro.
    expect(res.body).not.toHaveProperty("error");
  });

  it("toma el mensaje de la excepcion cuando no se envia uno propio", async () => {
    const res = await ingest({
      application: "ventas",
      level: "error",
      environment: "production",
      error: { name: "RangeError", message: "indice fuera de rango" },
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("indice fuera de rango");
    expect(res.body.errorName).toBe("RangeError");
  });

  it("no calcula huella para niveles que no se investigan", async () => {
    const res = await ingest({
      application: "ventas",
      level: "info",
      environment: "production",
      message: "todo bien",
    });
    expect(res.status).toBe(201);
    expect(res.body.fingerprint).toBeNull();
  });

  it("respeta una huella enviada por el emisor", async () => {
    const res = await ingest({
      application: "ventas",
      level: "error",
      environment: "production",
      message: "agrupado a mano",
      fingerprint: "huella-propia-del-emisor",
    });
    expect(res.status).toBe(201);
    expect(res.body.fingerprint).toBe("huella-propia-del-emisor");
  });

  it("recorta un stack desmesurado en vez de perder el log", async () => {
    const res = await ingest({
      application: "ventas",
      level: "error",
      environment: "production",
      message: "stack enorme",
      errorStack: "x".repeat(50001),
      metadata: { pedido: 12 },
    });
    expect(res.status).toBe(201);
    expect(res.body.errorStack).toHaveLength(50000);
    expect(res.body.errorStack.endsWith("…")).toBe(true);
    expect(res.body.metadata).toEqual({ pedido: 12, mclogTruncated: { errorStack: 50001 } });
  });

  /**
   * Antes, una sola entrada con el stack o el mensaje demasiado largos hacia
   * que el servidor respondiera 400 al lote entero, y se perdian todas.
   */
  it("una entrada desmesurada no tumba el lote", async () => {
    const base = { application: "lote-recortado", environment: "production", level: "info", message: "normal" };
    const res = await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", config.apiKey)
      .send({ logs: [base, { ...base, level: "error", message: "m".repeat(150000) }, base] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);

    const recortado = await prisma.log.findFirst({ where: { application: "lote-recortado", level: "error" } });
    expect(recortado?.message).toHaveLength(100000);
    expect(recortado?.metadata).toEqual({ mclogTruncated: { message: 150000 } });
  });
});

describe("Grupos de error", () => {
  it("reune las ocurrencias del mismo fallo en un solo grupo", async () => {
    const res = await request(app).get("/api/logs/errors/groups?application=facturacion").set(auth());
    expect(res.status).toBe(200);

    const timeout = res.body.data.find((group: { sampleMessage: string }) =>
      group.sampleMessage.startsWith("Timeout cobrando"),
    );
    expect(timeout).toBeTruthy();
    expect(timeout.count).toBe(3);
    expect(timeout.errorName).toBe("TypeError");
    expect(timeout.errorCode).toBe("ETIMEDOUT");
    expect(new Date(timeout.firstSeen).getTime()).toBeLessThanOrEqual(new Date(timeout.lastSeen).getTime());

    // El fallo distinto no se mezcla con el anterior.
    const rechazo = res.body.data.find((group: { sampleMessage: string }) => group.sampleMessage === "Tarjeta rechazada");
    expect(rechazo.count).toBe(1);
    expect(rechazo.fingerprint).not.toBe(timeout.fingerprint);
  });

  it("deja fuera los niveles que no son errores", async () => {
    const res = await request(app).get("/api/logs/errors/groups?application=facturacion").set(auth());
    const mensajes = res.body.data.map((group: { sampleMessage: string }) => group.sampleMessage);
    expect(mensajes).not.toContain("Cobro correcto");
  });

  it("permite bajar de un grupo a sus ocurrencias por la huella", async () => {
    const grupos = await request(app).get("/api/logs/errors/groups?application=facturacion").set(auth());
    const timeout = grupos.body.data.find((group: { count: number }) => group.count === 3);

    const res = await request(app).get(`/api/logs?fingerprint=${timeout.fingerprint}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it("acota la ventana temporal", async () => {
    const vacia = await request(app)
      .get("/api/logs/errors/groups?application=facturacion&from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z")
      .set(auth());
    expect(vacia.status).toBe(200);
    expect(vacia.body.data).toHaveLength(0);
  });
});

describe("Traza", () => {
  it("devuelve la operacion completa en orden cronologico", async () => {
    const res = await request(app).get("/api/logs/trace/traza-comun").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);

    const marcas = res.body.data.map((row: { timestamp: string }) => new Date(row.timestamp).getTime());
    expect([...marcas].sort((a, b) => a - b)).toEqual(marcas);
  });

  it("devuelve 404 si la traza no existe", async () => {
    const res = await request(app).get("/api/logs/trace/no-existe").set(auth());
    expect(res.status).toBe(404);
  });
});

describe("Contexto de un log", () => {
  it("devuelve lo que ocurrio alrededor, en la misma aplicacion y servicio", async () => {
    const listado = await request(app).get("/api/logs?application=facturacion&pageSize=1").set(auth());
    const id = listado.body.data[0].id;

    const res = await request(app).get(`/api/logs/${id}/context?before=300&after=300`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.target.id).toBe(id);
    expect(res.body.total).toBeGreaterThan(1);
    expect(res.body.data.every((row: { application: string }) => row.application === "facturacion")).toBe(true);
  });

  it("devuelve 404 para un log inexistente", async () => {
    const res = await request(app).get("/api/logs/999999/context").set(auth());
    expect(res.status).toBe(404);
  });
});

describe("Inventario de aplicaciones", () => {
  it("resume lo que esta emitiendo logs", async () => {
    const res = await request(app).get("/api/logs/applications").set(auth());
    expect(res.status).toBe(200);

    const facturacion = res.body.data.find((row: { application: string }) => row.application === "facturacion");
    expect(facturacion).toBeTruthy();
    expect(facturacion.count).toBeGreaterThan(0);
    expect(facturacion.services).toContain("pagos");
    expect(facturacion.environments).toContain("production");
    expect(facturacion.errorsLast24h).toBeGreaterThan(0);
  });

  it("agrega bien varios servicios y entornos de una misma aplicacion", async () => {
    const base = { application: "inventario-mixta", message: "evento" };
    await ingest({ ...base, service: "a", environment: "production", level: "error" });
    await ingest({ ...base, service: "a", environment: "production", level: "info" });
    await ingest({ ...base, service: "b", environment: "staging", level: "error" });
    await ingest({ ...base, environment: "production", level: "info" });

    const res = await request(app).get("/api/logs/applications").set(auth());
    const mixta = res.body.data.find((row: { application: string }) => row.application === "inventario-mixta");

    expect(mixta.count).toBe(4);
    expect(mixta.errorsLast24h).toBe(2);
    // Sin service, la ingesta usa el nombre de la aplicacion.
    expect([...mixta.services].sort()).toEqual(["a", "b", "inventario-mixta"]);
    expect([...mixta.environments].sort()).toEqual(["production", "staging"]);
  });

  it("solo mira la ventana, una semana por defecto", async () => {
    const hace10Dias = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    await ingest({
      application: "inventario-antigua",
      level: "info",
      environment: "production",
      message: "Ultimo aviso",
      timestamp: hace10Dias,
    });
    const nombres = (res: request.Response) => res.body.data.map((row: { application: string }) => row.application);

    const semana = await request(app).get("/api/logs/applications").set(auth());
    expect(semana.status).toBe(200);
    expect(nombres(semana)).not.toContain("inventario-antigua");
    expect(new Date(semana.body.to).getTime() - new Date(semana.body.from).getTime()).toBe(7 * 24 * 3600 * 1000);

    const mes = await request(app).get("/api/logs/applications?hours=744").set(auth());
    expect(nombres(mes)).toContain("inventario-antigua");
  });

  it("rechaza una ventana menor de 24 horas, que recortaria los errores", async () => {
    const res = await request(app).get("/api/logs/applications?hours=1").set(auth());
    expect(res.status).toBe(400);
  });
});

describe("Estadisticas con linea temporal", () => {
  it("incluye la serie por hora y por nivel", async () => {
    const res = await request(app).get("/api/logs/stats?hours=24").set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.timeline.length).toBeGreaterThan(0);

    const total = res.body.timeline.reduce(
      (suma: number, bucket: { error: number; warn: number; info: number; debug: number }) =>
        suma + bucket.error + bucket.warn + bucket.info + bucket.debug,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});
