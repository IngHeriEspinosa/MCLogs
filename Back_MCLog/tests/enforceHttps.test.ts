import { describe, it, expect, vi, beforeAll } from "vitest";

let enforceHttps: any;
beforeAll(async () => {
  process.env.FORCE_HTTPS = "1";
  vi.resetModules();
  ({ enforceHttps } = await import("../src/middlewares/enforceHttps"));
});

/** Simula una peticion con la IP TCP real y las cabeceras indicadas. */
const run = (remoteAddress: string, headers: Record<string, any> = {}) => {
  const req: any = { headers, socket: { remoteAddress }, protocol: "http" };
  const res: any = { statusCode: 0, body: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  let passed = false;
  enforceHttps(req, res, () => { passed = true; });
  return { passed, status: res.statusCode };
};

describe("enforceHttps con FORCE_HTTPS=1", () => {
  it("deja pasar el healthcheck loopback sin cabeceras", () => {
    expect(run("127.0.0.1").passed).toBe(true);
  });
  it("deja pasar loopback en IPv6 y en forma mapeada", () => {
    expect(run("::1").passed).toBe(true);
    expect(run("::ffff:127.0.0.1").passed).toBe(true);
  });
  it("rechaza a un cliente remoto que llega por http", () => {
    const r = run("186.150.3.15", { "x-forwarded-proto": "http" });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(400);
  });
  it("no se puede burlar falsificando x-forwarded-for", () => {
    const r = run("186.150.3.15", { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "http" });
    expect(r.passed).toBe(false);
  });
  it("acepta a un cliente remoto que llega por https", () => {
    expect(run("186.150.3.15", { "x-forwarded-proto": "https" }).passed).toBe(true);
  });
  it("toma el primer salto con varios proxies encadenados", () => {
    expect(run("186.150.3.15", { "x-forwarded-proto": "https, http" }).passed).toBe(true);
    expect(run("186.150.3.15", { "x-forwarded-proto": "http, https" }).passed).toBe(false);
  });
});
