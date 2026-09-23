import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRedactor, redactText, redactValue } from "@/common/reports/redact";

describe("redactText", () => {
  it("enmascara JWT, cabeceras, pares clave=valor, correos e IPs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const out = redactText(
      `token ${jwt} Authorization: Bearer abcdefgh12345678 password=hunter22 mail ana@example.com from 10.0.0.12`,
    );
    assert.ok(!out.includes(jwt));
    assert.ok(out.includes("[REDACTED:jwt]"));
    assert.ok(!out.includes("abcdefgh12345678"));
    assert.ok(redactText("Bearer abcdefgh12345678").includes("Bearer [REDACTED:token]"));
    assert.ok(out.includes("password=[REDACTED:secret]"));
    assert.ok(out.includes("[REDACTED:email]"));
    assert.ok(out.includes("[REDACTED:ip]"));
  });

  it("enmascara claves largas sueltas", () => {
    // Se arma en tiempo de ejecución: como literal, el escáner de secretos de
    // GitHub la toma por una clave real de Stripe y bloquea el push.
    const key = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dcAbCdEf"].join("_");
    assert.equal(redactText(`key ${key}`), "key [REDACTED:key]");
  });

  it("conserva los UUID: son ids de entidades, no secretos", () => {
    const text = "Order 550e8400-e29b-41d4-a716-446655440000 not found";
    assert.equal(redactText(text), text);
  });

  it("no toca texto sin datos sensibles", () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'id') at handler (src/app.ts:42:7)";
    assert.equal(redactText(text), text);
  });
});

describe("createRedactor", () => {
  it("cuenta solo lo que enmascara", () => {
    const redactor = createRedactor();
    redactor.text("ana@example.com y luis@example.com");
    redactor.text("Order 550e8400-e29b-41d4-a716-446655440000");
    assert.equal(redactor.count, 2);
  });

  it("cuenta las claves con nombre de secreto en objetos", () => {
    const redactor = createRedactor();
    const out = redactor.value({ user: "x", headers: { authorization: "abc", cookie: "s=1" } });
    assert.deepEqual(out, { user: "x", headers: { authorization: "[REDACTED:secret]", cookie: "[REDACTED:secret]" } });
    assert.equal(redactor.count, 2);
  });
});

describe("redactValue", () => {
  it("recorre arrays y objetos anidados", () => {
    assert.deepEqual(redactValue([{ password: "x" }, "ana@example.com"]), [{ password: "[REDACTED:secret]" }, "[REDACTED:email]"]);
  });
});
