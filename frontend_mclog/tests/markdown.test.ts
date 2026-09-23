import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mdCell, mdCode, mdFence, safeHref, stackHead } from "@/common/reports/markdown";

describe("markdown", () => {
  it("una celda escapa barras y aplana saltos de linea", () => {
    assert.equal(mdCell("a|b\nc"), "a\\|b c");
    assert.equal(mdCell(""), "—");
  });

  it("la valla de codigo es mas larga que cualquier racha del contenido", () => {
    assert.equal(mdFence("x ```` y"), "`````\nx ```` y\n`````");
    assert.equal(mdCode("a`b"), "`` a`b ``");
  });

  it("stackHead recorta y dice cuanto omitio", () => {
    assert.deepEqual(stackHead("a\nb\nc", 2), { lines: ["a", "b"], omitted: 1 });
  });
});

describe("safeHref", () => {
  const origin = "https://mclog.example.com";

  it("admite enlaces al propio MCLog", () => {
    assert.equal(safeHref(`${origin}/logs?fingerprint=abc`, origin), `${origin}/logs?fingerprint=abc`);
  });

  it("rechaza otros origenes, esquemas peligrosos y sin origen de referencia", () => {
    assert.equal(safeHref("https://evil.example.com/x", origin), null);
    assert.equal(safeHref("javascript:alert(1)", origin), null);
    assert.equal(safeHref(`${origin}/logs`, undefined), null);
    assert.equal(safeHref("no es una url", origin), null);
  });
});
