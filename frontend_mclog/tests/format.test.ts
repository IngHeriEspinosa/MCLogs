import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFormatter } from "@/common/i18n/format";

const fmt = createFormatter("es");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("duraciones", () => {
  it("escribe cada escala con su unidad", () => {
    assert.equal(fmt.duration(840), "840 ms");
    assert.equal(fmt.duration(12_400), "12,4 s");
    assert.equal(fmt.duration(3 * MINUTE + 12 * SECOND), "3 min 12 s");
    assert.equal(fmt.duration(2 * HOUR + 5 * MINUTE), "2 h 5 min");
    assert.equal(fmt.duration(3 * DAY + 4 * HOUR), "3 d 4 h");
  });

  it("el redondeo arrastra a la unidad mayor en lugar de escribir 60 o 24", () => {
    assert.equal(fmt.duration(MINUTE + 59.6 * SECOND), "2 min");
    assert.equal(fmt.duration(HOUR + 59.6 * MINUTE), "2 h");
    assert.equal(fmt.duration(DAY + 23.6 * HOUR), "2 d");
    assert.equal(fmt.duration(59.999 * SECOND), "1 min");
    assert.equal(fmt.duration(999.6), "1 s");
  });
});
