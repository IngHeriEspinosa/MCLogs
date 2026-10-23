import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";
import { config } from "../src/config/env";
import { laplace, recurrenceOf } from "../src/services/analysisService";

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

  it("admite los mismos filtros que el listado", async () => {
    const grupos = (query: string) => request(app).get(`/api/logs/errors/groups?application=facturacion&${query}`).set(auth());

    const porTexto = await grupos("search=rechazada");
    expect(porTexto.status).toBe(200);
    expect(porTexto.body.data.map((group: { sampleMessage: string }) => group.sampleMessage)).toEqual(["Tarjeta rechazada"]);

    const porClase = await grupos("errorName=typeerror");
    expect(porClase.body.data).toHaveLength(1);
    expect(porClase.body.data[0].count).toBe(3);
  });

  it("junta errores y warnings si se piden los dos niveles", async () => {
    await ingest({ application: "grupos-mixtos", level: "error", environment: "production", message: "se cayo" });
    await ingest({ application: "grupos-mixtos", level: "warn", environment: "production", message: "va lento" });
    const niveles = async (query: string) => {
      const res = await request(app).get(`/api/logs/errors/groups?application=grupos-mixtos${query}`).set(auth());
      return res.body.data.map((group: { level: string }) => group.level).sort();
    };

    // Sin nivel, solo errores: es lo que busca quien abre la vista de fallos.
    expect(await niveles("")).toEqual(["error"]);
    expect(await niveles("&level=error,warn")).toEqual(["error", "warn"]);
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

  /**
   * Antes era una sola consulta ascendente desde `from`: con trafico, el limite
   * se llenaba con lo mas antiguo de la ventana y el log se quedaba fuera.
   */
  describe("con mas registros que el limite", () => {
    const base = { application: "contexto-denso", service: "api", level: "info", environment: "production" };
    const at = Date.parse("2026-09-20T12:00:00.000Z");
    const stamp = (offsetSeconds: number) => new Date(at + offsetSeconds * 1000).toISOString();
    let targetId: number;

    beforeAll(async () => {
      for (let index = 30; index >= 1; index -= 1) {
        await ingest({ ...base, message: `antes ${index}`, timestamp: stamp(-index * 2) });
      }
      const target = await ingest({ ...base, level: "error", message: "el fallo", timestamp: stamp(0) });
      targetId = target.body.id;
      for (let index = 1; index <= 3; index += 1) {
        await ingest({ ...base, message: `despues ${index}`, timestamp: stamp(index * 2) });
      }
      // Mismo segundo, otro entorno u otro servicio: no son su contexto.
      await ingest({ ...base, environment: "staging", message: "otro entorno", timestamp: stamp(-1) });
      await ingest({ ...base, service: "worker", message: "otro servicio", timestamp: stamp(-1) });
    });

    const messages = (res: request.Response) => res.body.data.map((row: { message: string }) => row.message);

    it("incluye el log y lo inmediatamente anterior, no lo mas antiguo de la ventana", async () => {
      const res = await request(app).get(`/api/logs/${targetId}/context?before=120&after=120&limit=11`).set(auth());
      expect(res.status).toBe(200);
      // 10 huecos: 3 posteriores (no hay mas) y los 7 anteriores mas cercanos.
      expect(messages(res)).toEqual([
        "antes 7", "antes 6", "antes 5", "antes 4", "antes 3", "antes 2", "antes 1",
        "el fallo",
        "despues 1", "despues 2", "despues 3",
      ]);
      expect(res.body.data[7].id).toBe(targetId);
    });

    it("da a lo anterior la mitad mayor cuando ambos lados sobran", async () => {
      const res = await request(app).get(`/api/logs/${targetId}/context?before=120&after=120&limit=4`).set(auth());
      expect(messages(res)).toEqual(["antes 2", "antes 1", "el fallo", "despues 1"]);
    });

    it("no mezcla otros entornos ni otros servicios", async () => {
      const res = await request(app).get(`/api/logs/${targetId}/context?before=120&after=120&limit=200`).set(auth());
      expect(messages(res)).not.toContain("otro entorno");
      expect(messages(res)).not.toContain("otro servicio");
      expect(res.body.total).toBe(34);
    });
  });
});

describe("Ocurrencias de un fallo", () => {
  const failure = {
    application: "ocurrencias",
    service: "cobros",
    level: "error",
    message: "Pasarela caida",
    errorStack: STACK,
  };
  let latestId: number;

  beforeAll(async () => {
    const hace10Dias = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    await ingest({ ...failure, environment: "production", timestamp: hace10Dias });
    await ingest({ ...failure, environment: "staging" });
    await ingest({ ...failure, environment: "production" });
    latestId = (await ingest({ ...failure, environment: "production" })).body.id;
  });

  it("cuenta 24 h, 7 dias y el total conservado, por entorno", async () => {
    const res = await request(app).get(`/api/logs/${latestId}/occurrences`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.retentionMonths).toBeGreaterThan(0);

    const data = res.body.data;
    expect(data.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(data).toMatchObject({ total: 4, last24h: 3, last7d: 3 });
    expect(Date.now() - new Date(data.firstSeen).getTime()).toBeGreaterThan(9 * 24 * 3600 * 1000);
    expect(data.environments).toEqual([
      expect.objectContaining({ environment: "production", total: 3, last24h: 2, last7d: 2 }),
      expect.objectContaining({ environment: "staging", total: 1, last24h: 1, last7d: 1 }),
    ]);
  });

  it("estima la probabilidad con las horas de 7 dias y los dias de 30, en su servicio y entorno", async () => {
    const { recurrence } = (await request(app).get(`/api/logs/${latestId}/occurrences`).set(auth())).body.data;
    // El log es de produccion: la observacion empieza en el primer log de ese
    // servicio y entorno en 30 dias, el de hace 10 dias. El de staging no cuenta.
    const observedAgo = Date.now() - new Date(recurrence.observedFrom).getTime();
    expect(observedAgo).toBeGreaterThan(9 * 24 * 3600 * 1000);
    expect(observedAgo).toBeLessThan(11 * 24 * 3600 * 1000);
    // Horas: solo los ultimos 7 dias, asi que la de hace 10 dias no esta.
    expect(recurrence.activeHours).toBeGreaterThanOrEqual(1);
    expect(recurrence.activeHours).toBeLessThanOrEqual(2);
    expect(recurrence.observedHours).toBeGreaterThanOrEqual(7 * 24);
    expect(recurrence.nextHour).toBeCloseTo(laplace(recurrence.activeHours, recurrence.observedHours));
    // Dias: hoy y el de hace 10 dias.
    expect(recurrence.activeDays).toBeGreaterThanOrEqual(2);
    expect(recurrence.observedDays).toBeGreaterThanOrEqual(10);
    expect(recurrence.next24h).toBeCloseTo(laplace(recurrence.activeDays, recurrence.observedDays));
  });

  it("calcula que parte de las operaciones del servicio y entorno acaba en el fallo", async () => {
    const base = { application: "tasa-fallo", service: "cobros", environment: "production" };
    const rechazo = { ...base, level: "error", message: "Tarjeta rechazada", errorStack: STACK };
    for (const traceId of ["op-1", "op-2", "op-3", "op-4"]) {
      await ingest({ ...base, level: "info", message: "Cobro iniciado", traceId });
    }
    await ingest({ ...rechazo, traceId: "op-1" });
    await ingest({ ...rechazo, traceId: "op-1" });
    // Sin traceId propio no hay operacion: MCLog ya no inventa una por peticion.
    await ingest(rechazo);
    // No cuentan: otro entorno y otro servicio.
    await ingest({ ...rechazo, environment: "staging", traceId: "op-9" });
    await ingest({ ...base, service: "otro", level: "info", message: "Otro servicio", traceId: "op-5" });
    const target = (await ingest({ ...rechazo, traceId: "op-2" })).body.id;

    const { data } = (await request(app).get(`/api/logs/${target}/occurrences`).set(auth())).body;
    expect(data.total).toBe(5);
    expect(data.failureRate).toEqual({
      application: "tasa-fallo",
      service: "cobros",
      environment: "production",
      operations: 4,
      failed: 2,
      rate: 0.5,
    });
  });

  it("devuelve data null si el log no tiene huella", async () => {
    const info = await ingest({ application: "ocurrencias", level: "info", environment: "production", message: "ok" });
    const res = await request(app).get(`/api/logs/${info.body.id}/occurrences`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("devuelve 404 para un log inexistente y 400 para un id invalido", async () => {
    expect((await request(app).get("/api/logs/999999/occurrences").set(auth())).status).toBe(404);
    expect((await request(app).get("/api/logs/abc/occurrences").set(auth())).status).toBe(400);
  });
});

describe("Probabilidad de repeticion", () => {
  const now = new Date("2026-09-29T12:30:00Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it("aplica la regla de sucesion de Laplace", () => {
    expect(laplace(0, 0)).toBe(0.5);
    expect(laplace(5, 45)).toBeCloseTo(6 / 47);
  });

  it("cuenta horas de reloj, y varias ocurrencias en la misma hora cuentan una vez", () => {
    const recurrence = recurrenceOf(
      [hoursAgo(0), new Date("2026-09-29T12:05:00Z"), hoursAgo(3), hoursAgo(20)],
      hoursAgo(44),
      now,
    );
    // 44 horas completas y la actual, que cuenta porque ya tuvo el fallo.
    expect(recurrence).toMatchObject({ observedHours: 45, activeHours: 3 });
    expect(recurrence.nextHour).toBeCloseTo(4 / 47);
    // Dias de reloj: el 27 y el 28 completos y el 29 en curso, con el fallo el 28 y el 29.
    expect(recurrence).toMatchObject({ observedDays: 3, activeDays: 2 });
    expect(recurrence.next24h).toBeCloseTo(3 / 5);
  });

  it("con pocos datos no afirma ni 0 % ni 100 %", () => {
    const quiet = recurrenceOf([], hoursAgo(168), now);
    expect(quiet.activeHours).toBe(0);
    expect(quiet.nextHour).toBeGreaterThan(0);
    expect(quiet.nextHour).toBeLessThan(0.01);

    const always = recurrenceOf([hoursAgo(0), hoursAgo(1)], hoursAgo(1), now);
    expect(always).toMatchObject({ observedHours: 2, activeHours: 2 });
    expect(always.nextHour).toBe(0.75);
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

  it("con filtros, solo cuenta los logs que los cumplen", async () => {
    const inventario = (query: string) =>
      request(app).get(`/api/logs/applications?application=inventario-mixta&${query}`).set(auth());

    const porServicio = await inventario("service=b");
    expect(porServicio.status).toBe(200);
    expect(porServicio.body.data).toHaveLength(1);
    expect(porServicio.body.data[0]).toMatchObject({ count: 1, errorsLast24h: 1, services: ["b"], environments: ["staging"] });

    const produccion = (await inventario("environment=production")).body.data[0];
    expect(produccion).toMatchObject({ count: 3, errorsLast24h: 1, environments: ["production"] });
    expect([...produccion.services].sort()).toEqual(["a", "inventario-mixta"]);
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

describe("Estadisticas en una ventana", () => {
  const application = "stats-ventana";

  beforeAll(async () => {
    const hace3Dias = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    await ingest({ application, level: "error", environment: "staging", message: "viejo", timestamp: hace3Dias });
    await ingest({ application, level: "info", environment: "production", message: "reciente" });
  });

  it("con from/to, los totales y los repartos son los de la ventana", async () => {
    const from = new Date(Date.now() - 3600 * 1000).toISOString();
    const res = await request(app).get(`/api/logs/stats?application=${application}&from=${from}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.byEnvironment).toEqual([{ environment: "production", count: 1 }]);
  });

  it("solo con hours, los totales siguen siendo de todo el historico", async () => {
    const res = await request(app).get(`/api/logs/stats?application=${application}&hours=1`).set(auth());
    expect(res.body.total).toBe(2);
  });

  it("elige el intervalo de la serie segun la ventana", async () => {
    const corto = await request(app).get(`/api/logs/stats?application=${application}&hours=1`).set(auth());
    expect(corto.body.bucketSeconds).toBe(300);
    const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const largo = await request(app).get(`/api/logs/stats?application=${application}&from=${from}`).set(auth());
    expect(largo.body.bucketSeconds).toBe(86400);
    // Con intervalos de un dia, cada uno empieza a medianoche UTC.
    expect(largo.body.timeline.length).toBe(2);
    for (const bucket of largo.body.timeline as Array<{ bucket: string }>) {
      expect(new Date(bucket.bucket).getUTCHours()).toBe(0);
    }
    const explicito = await request(app).get(`/api/logs/stats?application=${application}&hours=1&bucket=1h`).set(auth());
    expect(explicito.body.bucketSeconds).toBe(3600);
  });

  it("rechaza una ventana invertida y un intervalo desconocido", async () => {
    const to = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const from = new Date().toISOString();
    expect((await request(app).get(`/api/logs/stats?from=${from}&to=${to}`).set(auth())).status).toBe(400);
    expect((await request(app).get("/api/logs/stats?bucket=7m").set(auth())).status).toBe(400);
  });

  it("el inventario acepta from/to y cuenta los errores de esa ventana", async () => {
    const from = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
    const res = await request(app).get(`/api/logs/applications?application=${application}&from=${from}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ application, count: 2, errors: 1, errorsLast24h: 0 }),
    ]);
  });
});

describe("Ejemplo de cada grupo de error", () => {
  it("sale de la ventana pedida, no del log mas reciente de la huella", async () => {
    const fingerprint = "ejemplo-ventana";
    const base = { application: "ejemplos", level: "error", environment: "production", fingerprint };
    const hace2Dias = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const antiguo = await ingest({ ...base, message: "dentro", timestamp: hace2Dias });
    await ingest({ ...base, message: "fuera" });

    const to = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const from = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const res = await request(app).get(`/api/logs/errors/groups?application=ejemplos&from=${from}&to=${to}`).set(auth());
    expect(res.body.data).toEqual([
      expect.objectContaining({ fingerprint, count: 1, lastLogId: antiguo.body.id, sampleMessage: "dentro" }),
    ]);
  });
});

describe("traceId de la ingesta", () => {
  it("no inventa uno si el emisor no lo manda", async () => {
    const res = await ingest({ application: "sin-traza", level: "info", environment: "production", message: "suelto" });
    expect(res.status).toBe(201);
    expect(res.body.traceId).toBeNull();
  });

  it("aplica la cabecera x-trace-id a los logs que no traen el suyo", async () => {
    const res = await request(app)
      .post("/api/logs/batch")
      .set("x-api-key", config.apiKey)
      .set("x-trace-id", "traza-cabecera")
      .send({
        logs: [
          { application: "con-traza", level: "info", environment: "production", message: "uno" },
          { application: "con-traza", level: "info", environment: "production", message: "dos", traceId: "propia" },
        ],
      });
    expect(res.status).toBe(201);
    const logs = await prisma.log.findMany({ where: { application: "con-traza" }, orderBy: { id: "asc" } });
    expect(logs.map((log) => log.traceId)).toEqual(["traza-cabecera", "propia"]);
  });
});

describe("Fecha futura en la ingesta", () => {
  it("la trae a ahora y guarda la original en metadata", async () => {
    const futura = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const res = await ingest({
      application: "reloj",
      level: "info",
      environment: "production",
      message: "adelantado",
      timestamp: futura,
      metadata: { a: 1 },
    });
    expect(res.status).toBe(201);
    expect(Math.abs(new Date(res.body.timestamp).getTime() - Date.now())).toBeLessThan(60 * 1000);
    expect(res.body.metadata).toEqual({ a: 1, mclogClockSkew: { timestamp: futura } });
  });

  it("respeta un adelanto pequeno, dentro del margen", async () => {
    const casi = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await ingest({ application: "reloj", level: "info", environment: "production", message: "casi", timestamp: casi });
    expect(new Date(res.body.timestamp).toISOString()).toBe(casi);
    expect(res.body.metadata).toBeNull();
  });
});

describe("Traza larga", () => {
  it("devuelve el principio y el final y dice cuantos faltan", async () => {
    const { workspaceId } = await prisma.log.findFirstOrThrow({ where: { application: "facturacion" } });
    const start = Date.now() - 3600 * 1000;
    await prisma.log.createMany({
      data: Array.from({ length: 1010 }, (_, index) => ({
        workspaceId,
        application: "traza-larga",
        level: "info" as const,
        environment: "production" as const,
        message: `paso ${index}`,
        traceId: "traza-larga",
        timestamp: new Date(start + index * 1000),
      })),
    });

    const res = await request(app).get("/api/logs/trace/traza-larga").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1010, truncated: true, omitted: 10 });
    expect(res.body.data).toHaveLength(1000);
    expect(res.body.data[0].message).toBe("paso 0");
    expect(res.body.data[999].message).toBe("paso 1009");
  });
});

describe("Tramos de una traza", () => {
  it("guarda el tramo padre y la duracion", async () => {
    const res = await ingest({
      application: "tramos",
      level: "info",
      environment: "production",
      message: "consulta",
      traceId: "op-tramos",
      spanId: "s2",
      parentSpanId: "s1",
      durationMs: 42,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ spanId: "s2", parentSpanId: "s1", durationMs: 42 });
  });

  it("rechaza una duracion negativa o no entera", async () => {
    const base = { application: "tramos", level: "info", environment: "production", message: "x" };
    expect((await ingest({ ...base, durationMs: -1 })).status).toBe(400);
    expect((await ingest({ ...base, durationMs: "rapido" })).status).toBe(400);
  });

  it("toma traceId y spanId de la cabecera traceparent si el log no los trae", async () => {
    const res = await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
      .send({ application: "w3c", level: "info", environment: "production", message: "desde otel" });
    expect(res.body).toMatchObject({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" });
  });

  it("ignora un traceparent mal formado", async () => {
    const res = await request(app)
      .post("/api/log")
      .set("x-api-key", config.apiKey)
      .set("traceparent", "00-00000000000000000000000000000000-00f067aa0ba902b7-01")
      .send({ application: "w3c", level: "info", environment: "production", message: "invalido" });
    expect(res.body.traceId).toBeNull();
  });
});

describe("Lista de operaciones", () => {
  beforeAll(async () => {
    const base = { application: "operaciones", environment: "production" };
    await ingest({ ...base, service: "tienda", level: "info", message: "pedido", traceId: "op-a" });
    await ingest({ ...base, service: "pagos", level: "error", message: "rechazado", traceId: "op-a" });
    await ingest({ ...base, service: "tienda", level: "info", message: "pedido", traceId: "op-b" });
    await ingest({ ...base, level: "info", message: "sin traza" });
  });

  it("resume cada traceId de la ventana, la mas reciente primero", async () => {
    const res = await request(app).get("/api/logs/traces?application=operaciones").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((row: { traceId: string }) => row.traceId)).toEqual(["op-b", "op-a"]);
    expect(res.body.data[1]).toMatchObject({ count: 2, errors: 1, warnings: 0, applications: ["operaciones"] });
    expect([...res.body.data[1].services].sort()).toEqual(["pagos", "tienda"]);
  });

  it("con onlyErrors deja solo las que fallaron", async () => {
    const res = await request(app).get("/api/logs/traces?application=operaciones&onlyErrors=true").set(auth());
    expect(res.body.data.map((row: { traceId: string }) => row.traceId)).toEqual(["op-a"]);
  });

  it("pagina", async () => {
    const res = await request(app).get("/api/logs/traces?application=operaciones&pageSize=1&page=2").set(auth());
    expect(res.body).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(res.body.data).toHaveLength(1);
  });
});

describe("Por que se agrupan", () => {
  it("las ocurrencias explican las piezas de la huella y los grupos llevan la plantilla", async () => {
    const id = (
      await ingest({
        application: "agrupacion",
        service: "cobros",
        level: "error",
        environment: "production",
        message: "Timeout cobrando el pedido 991",
        errorStack: STACK,
        error: { name: "TypeError", code: "ETIMEDOUT" },
      })
    ).body.id;

    const { grouping } = (await request(app).get(`/api/logs/${id}/occurrences`).set(auth())).body.data;
    expect(grouping).toEqual({
      application: "agrupacion",
      service: "cobros",
      errorName: "TypeError",
      errorCode: "ETIMEDOUT",
      firstFrame: "at cobrar (/app/src/pagos.js)",
      messageTemplate: "timeout cobrando el pedido <n>",
      computed: true,
    });

    const groups = (await request(app).get("/api/logs/errors/groups?application=agrupacion").set(auth())).body.data;
    expect(groups[0].messageTemplate).toBe("timeout cobrando el pedido <n>");
  });
});
