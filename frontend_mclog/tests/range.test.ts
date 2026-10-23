import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { queryWindow } from "@/common/time/range";

const NOW = Date.UTC(2026, 9, 1, 12, 0);

describe("ventana de las consultas", () => {
  it("un rango relativo se cierra en el instante de referencia", () => {
    const window = queryWindow({ preset: "24h" }, NOW);
    assert.equal(window.from?.getTime(), NOW - 24 * 60 * 60 * 1000);
    assert.equal(window.to?.getTime(), NOW);
  });

  it("todo el historico sigue abierto por los dos lados", () => {
    assert.deepEqual(queryWindow({ preset: "all" }, NOW), {});
  });

  it("un rango absoluto conserva su final, y sin final se cierra en ahora", () => {
    const from = "2026-09-30T00:00:00.000Z";
    const to = "2026-09-30T06:00:00.000Z";
    assert.equal(queryWindow({ from, to }, NOW).to?.toISOString(), to);
    assert.equal(queryWindow({ from }, NOW).to?.getTime(), NOW);
  });
});
