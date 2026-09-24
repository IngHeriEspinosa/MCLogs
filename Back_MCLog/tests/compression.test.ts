import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";

// /openapi.json es publico y pesa decenas de KB: sirve para probar el
// middleware sin preparar datos. /health, en cambio, cabe en menos de 1 KB.
describe("compresion de las respuestas JSON", () => {
  it("usa brotli si el cliente lo acepta", async () => {
    const res = await request(app).get("/openapi.json").set("Accept-Encoding", "gzip, deflate, br").buffer(true).parse((r, done) => {
      r.on("data", () => undefined);
      r.on("end", () => done(null, null));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.headers["vary"]).toMatch(/Accept-Encoding/i);
  });

  it("usa gzip si no hay brotli, y el cuerpo sigue siendo el mismo JSON", async () => {
    const res = await request(app).get("/openapi.json").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body.openapi).toBe("3.0.0");
  });

  it("no comprime si el cliente no lo pide o lo rechaza", async () => {
    const plain = await request(app).get("/openapi.json").set("Accept-Encoding", "identity");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.openapi).toBe("3.0.0");
    const refused = await request(app).get("/openapi.json").set("Accept-Encoding", "gzip;q=0");
    expect(refused.headers["content-encoding"]).toBeUndefined();
  });

  it("no comprime respuestas pequeñas", async () => {
    const res = await request(app).get("/health").set("Accept-Encoding", "gzip, br");
    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
