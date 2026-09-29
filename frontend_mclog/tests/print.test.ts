import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cssString } from "@/common/print";

describe("print", () => {
  it("cssString entrecomilla y escapa comillas y barras invertidas", () => {
    assert.equal(cssString("MCLog · informe"), '"MCLog · informe"');
    assert.equal(cssString('a"b\\c'), '"a\\"b\\\\c"');
  });

  it("cssString aplana los saltos de linea, que una cadena CSS no admite", () => {
    assert.equal(cssString("a\r\nb\nc"), '"a b c"');
  });
});
