import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { config } from "../src/config/env";
import { environmentOf, isoFromUnixNano, levelOf, otlpId, translateOtlpLogs } from "../src/utils/otlp";

const prisma = createPrismaClient();

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN = "00f067aa0ba902b7";

const str = (value: string) => ({ stringValue: value });
const kv = (key: string, value: unknown) => ({ key, value });

/** Un ExportLogsServiceRequest como lo manda un SDK de OpenTelemetry. */
const exportRequest = (records: unknown[], resource: Array<{ key: string; value: unknown }> = []) => ({
  resourceLogs: [
    {
      resource: {
        attributes: [
          kv("service.name", str("otlp-checkout")),
          kv("service.version", str("3.1.0")),
          kv("deployment.environment.name", str("production")),
          kv("host.name", str("pod-7")),
          ...resource,
        ],
      },
      scopeLogs: [{ scope: { name: "checkout.http" }, logRecords: records }],
    },
  ],
});

const cleanup = async () => {
  await prisma.log.deleteMany({ where: { application: { startsWith: "otlp-" } } });
  await prisma.errorGroup.deleteMany({ where: { application: { startsWith: "otlp-" } } });
};

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Traduccion OTLP", () => {
  it("severityNumber y, sin el, severityText dan el nivel", () => {
    expect(levelOf(1, undefined)).toBe("debug");
    expect(levelOf(9, "INFO")).toBe("info");
    expect(levelOf(13, undefined)).toBe("warn");
    expect(levelOf(21, undefined)).toBe("error");
    expect(levelOf(0, "Warning")).toBe("warn");
    expect(levelOf(undefined, "FATAL")).toBe("error");
    expect(levelOf(undefined, undefined)).toBe("info");
  });

  it("el entorno de OTel se lleva a los tres de MCLog", () => {
    expect(environmentOf("prod")).toBe("production");
    expect(environmentOf("UAT")).toBe("staging");
    expect(environmentOf("local")).toBe("development");
    expect(environmentOf(undefined)).toBe("development");
  });

  it("nanosegundos a ISO sin perder los milisegundos", () => {
    expect(isoFromUnixNano("1727784000123456789")).toBe("2024-10-01T12:00:00.123Z");
    expect(isoFromUnixNano("0")).toBeUndefined();
    expect(isoFromUnixNano("abc")).toBeUndefined();
  });

  it("acepta los identificadores en hexadecimal o en base64, y los todo ceros son sin traza", () => {
    expect(otlpId(TRACE.toUpperCase(), 16)).toBe(TRACE);
    expect(otlpId(Buffer.from(TRACE, "hex").toString("base64"), 16)).toBe(TRACE);
    expect(otlpId("0".repeat(16), 8)).toBeUndefined();
    expect(otlpId("xyz", 8)).toBeUndefined();
  });

  it("mapea recurso, registro, excepcion y atributos", () => {
    const { logs, rejected } = translateOtlpLogs(
      exportRequest(
        [
          {
            timeUnixNano: "1727784000123456789",
            severityNumber: 17,
            severityText: "ERROR",
            body: str("Payment provider did not answer"),
            traceId: TRACE,
            spanId: SPAN,
            attributes: [
              kv("exception.type", str("TimeoutError")),
              kv("exception.stacktrace", str("TimeoutError: ...\n  at charge (pay.js:10)")),
              kv("order.id", { intValue: "42" }),
              kv("retry", { kvlistValue: { values: [kv("attempt", { intValue: 2 })] } }),
            ],
          },
          "no soy un LogRecord",
        ],
        [kv("service.namespace", str("otlp-shop")), kv("k8s.pod.name", str("pod-7"))],
      ),
    );
    expect(rejected).toBe(1);
    expect(logs).toEqual([
      {
        application: "otlp-shop",
        service: "otlp-checkout",
        environment: "production",
        level: "error",
        message: "Payment provider did not answer",
        host: "pod-7",
        release: "3.1.0",
        timestamp: "2024-10-01T12:00:00.123Z",
        traceId: TRACE,
        spanId: SPAN,
        errorName: "TimeoutError",
        errorStack: "TimeoutError: ...\n  at charge (pay.js:10)",
        metadata: {
          "order.id": 42,
          retry: { attempt: 2 },
          otel: { scope: "checkout.http", severityText: "ERROR" },
          resource: { "k8s.pod.name": "pod-7" },
        },
      },
    ]);
  });

  it("sin cuerpo usa el mensaje de la excepcion y recorta un service.name largo", () => {
    const { logs } = translateOtlpLogs(
      exportRequest([{ severityNumber: 17, attributes: [kv("exception.message", str("boom"))] }], [kv("service.name", str(`otlp-${"x".repeat(200)}`))]),
    );
    expect(logs[0]?.message).toBe("boom");
    expect(logs[0]?.service).toHaveLength(120);
  });

  it("un cuerpo que no es texto se guarda en JSON", () => {
    const { logs } = translateOtlpLogs(exportRequest([{ body: { kvlistValue: { values: [kv("event", str("login"))] } } }]));
    expect(logs[0]?.message).toBe('{"event":"login"}');
  });
});

describe("POST /v1/logs", () => {
  it("guarda los registros y responde como OTLP", async () => {
    const res = await request(app)
      .post("/v1/logs")
      .set("x-api-key", config.apiKey)
      .send(
        exportRequest([
          { severityNumber: 9, body: str("order created"), traceId: TRACE, spanId: SPAN },
          { severityNumber: 17, body: str("card declined"), attributes: [kv("exception.type", str("CardError"))] },
        ]),
      );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});

    const stored = await prisma.log.findMany({ where: { service: "otlp-checkout" }, orderBy: { id: "asc" } });
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ application: "otlp-checkout", level: "info", environment: "production", traceId: TRACE, spanId: SPAN, release: "3.1.0", host: "pod-7" });
    // Los errores reciben huella como cualquier otro log de error.
    expect(stored[1]).toMatchObject({ level: "error", errorName: "CardError" });
    expect(stored[1]?.fingerprint).toBeTruthy();
  });

  it("informa de los registros descartados con partialSuccess", async () => {
    const res = await request(app)
      .post("/v1/logs")
      .set("x-api-key", config.apiKey)
      .send(exportRequest([{ body: str("ok") }, 7]));
    expect(res.status).toBe(200);
    expect(res.body.partialSuccess.rejectedLogRecords).toBe(1);
  });

  it("un envio vacio es valido", async () => {
    const res = await request(app).post("/v1/logs").set("x-api-key", config.apiKey).send({ resourceLogs: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("rechaza protobuf con 415 y sin API key con 401", async () => {
    const protobuf = await request(app)
      .post("/v1/logs")
      .set("x-api-key", config.apiKey)
      .set("Content-Type", "application/x-protobuf")
      .send(Buffer.from([0x0a, 0x00]));
    expect(protobuf.status).toBe(415);

    const anonymous = await request(app).post("/v1/logs").send(exportRequest([{ body: str("x") }]));
    expect(anonymous.status).toBe(401);
  });
});
