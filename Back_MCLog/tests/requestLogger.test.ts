import { describe, expect, it } from "vitest";
import { SLOW_REQUEST_MS, requestLogLevel } from "../src/middlewares/requestLogger";

describe("Nivel de la linea de cada peticion", () => {
  it("lo rutinario va a http, por debajo de info", () => {
    expect(requestLogLevel("/api/logs", 200, 40)).toBe("http");
    expect(requestLogLevel("/auth/users", 304, 5)).toBe("http");
  });

  it("los 401 de comprobar la sesion al cargar no son un fallo", () => {
    expect(requestLogLevel("/auth/me", 401, 2)).toBe("http");
    expect(requestLogLevel("/auth/refresh", 401, 2)).toBe("http");
    // Un login fallido si interesa.
    expect(requestLogLevel("/auth/login", 401, 250)).toBe("info");
  });

  it("los demas 4xx salen en info", () => {
    expect(requestLogLevel("/auth/login", 429, 1)).toBe("info");
    expect(requestLogLevel("/api/settings", 403, 3)).toBe("info");
    expect(requestLogLevel("/api/logs/999", 404, 3)).toBe("info");
  });

  it("lo lento avisa aunque vaya bien, salvo las conexiones que duran lo que la pestana", () => {
    expect(requestLogLevel("/api/logs/export", 200, SLOW_REQUEST_MS)).toBe("warn");
    expect(requestLogLevel("/api/logs/stream", 200, 10 * 60_000)).toBe("http");
  });

  it("los 5xx son error, tarden lo que tarden", () => {
    expect(requestLogLevel("/api/logs", 500, 5)).toBe("error");
    expect(requestLogLevel("/api/logs", 503, 5_000)).toBe("error");
  });
});
