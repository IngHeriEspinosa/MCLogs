import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { joinLevels, parseLevels } from "@/common/filters/levels";

describe("filtro de varios niveles", () => {
  it("lee la lista de la URL sin desconocidos ni repetidos y en orden fijo", () => {
    assert.deepEqual(parseLevels("warn,error,bogus,warn"), ["error", "warn"]);
    assert.deepEqual(parseLevels(" info , debug "), ["info", "debug"]);
    assert.deepEqual(parseLevels(""), []);
  });

  it("un enlace antiguo con un solo nivel sigue valiendo", () => {
    assert.deepEqual(parseLevels("error"), ["error"]);
    assert.equal(joinLevels(parseLevels("error")), "error");
  });

  it("la misma seleccion da siempre el mismo enlace", () => {
    assert.equal(joinLevels(["debug", "error", "warn"]), "error,warn,debug");
    assert.equal(joinLevels(["warn", "error"]), joinLevels(["error", "warn"]));
    assert.equal(joinLevels([]), "");
  });
});
