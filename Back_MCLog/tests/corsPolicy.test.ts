import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import logger from "../src/config/logger";
import { corsPolicy } from "../src/middlewares/corsPolicy";
import { describeError, errorHandler } from "../src/middlewares/errorHandler";

const APP_ORIGIN = "https://mclog.example.com";

const appWith = (origins?: string[]) => {
  const app = express();
  app.use(corsPolicy(origins));
  app.post("/api/logs/query", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CORS", () => {
  it("un origen permitido pasa y recibe las cabeceras con credenciales", async () => {
    const res = await request(appWith([APP_ORIGIN])).post("/api/logs/query").set("Origin", APP_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(APP_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("sin Origin (curl, SDK de servidor, healthcheck) no se filtra", async () => {
    const res = await request(appWith([APP_ORIGIN])).post("/api/logs/query");
    expect(res.status).toBe(200);
  });

  it("sin lista de origenes se acepta cualquiera", async () => {
    const res = await request(appWith(undefined)).post("/api/logs/query").set("Origin", "https://otro.example.com");
    expect(res.status).toBe(200);
  });

  it("un origen ajeno recibe 403 y se avisa con origen y ruta, no como error", async () => {
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    const res = await request(appWith([APP_ORIGIN]))
      .post("/api/logs/query?page=2")
      .set("Origin", "https://otro.example.com");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CORS origin not allowed");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("CORS origin rejected", {
      origin: "https://otro.example.com",
      method: "POST",
      path: "/api/logs/query",
    });
    expect(error).not.toHaveBeenCalled();
  });
});

describe("Registro de errores", () => {
  it("conserva mensaje y stack, que JSON.stringify pierde", () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    const described = JSON.parse(JSON.stringify(describeError(err)));
    expect(described.message).toBe("boom");
    expect(described.stack).toContain("boom");
  });

  it("no copia el body crudo que trae el error de JSON mal formado", async () => {
    const log = vi.spyOn(logger, "log");
    const app = express();
    app.use(express.json());
    app.post("/auth/login", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"password":"secreta"');

    expect(res.status).toBe(400);
    const [level, message, meta] = log.mock.calls.at(-1) as unknown as [string, string, any];
    expect(level).toBe("warn");
    expect(message).toBe("Request rejected");
    expect(meta.path).toBe("/auth/login");
    expect(JSON.stringify(meta)).not.toContain("secreta");
  });
});
