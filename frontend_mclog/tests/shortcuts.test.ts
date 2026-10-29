import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHORD_TIMEOUT_MS, resolveShortcut, shortcutFor } from "@/common/keyboard/shortcuts";
import { DEFAULT_REFRESH, refreshIntervalMs } from "@/common/time/refresh";

const NOW = 1_000_000;

describe("atajos globales", () => {
  it("la g deja el atajo pendiente y la segunda tecla navega", () => {
    assert.deepEqual(resolveShortcut("g", null, NOW), { type: "pending" });
    assert.deepEqual(resolveShortcut("e", NOW, NOW + 200), { type: "navigate", href: "/errors" });
    assert.deepEqual(resolveShortcut("L", NOW, NOW + 200), { type: "navigate", href: "/logs" });
  });

  it("una letra sin destino cancela el atajo", () => {
    assert.equal(resolveShortcut("x", NOW, NOW + 200), null);
  });

  it("pasado el tiempo de espera la letra ya no navega", () => {
    assert.equal(resolveShortcut("e", NOW, NOW + CHORD_TIMEOUT_MS + 1), null);
  });

  it("la interrogacion abre la ayuda y una tecla suelta no hace nada", () => {
    assert.deepEqual(resolveShortcut("?", null, NOW), { type: "help" });
    assert.equal(resolveShortcut("e", null, NOW), null);
  });

  it("cada seccion con atajo lo expone para aria-keyshortcuts", () => {
    assert.equal(shortcutFor("/traces"), "g t");
    assert.equal(shortcutFor("/snapshots"), undefined);
  });
});

describe("auto-refresco", () => {
  it("convierte el ajuste en milisegundos y apagado es null", () => {
    assert.equal(refreshIntervalMs("15"), 15_000);
    assert.equal(refreshIntervalMs("300"), 300_000);
    assert.equal(refreshIntervalMs("off"), null);
  });

  it("un valor guardado que no se reconoce vuelve al de por defecto", () => {
    const fallback = refreshIntervalMs(DEFAULT_REFRESH);
    assert.equal(refreshIntervalMs("7"), fallback);
    assert.equal(refreshIntervalMs(true), fallback);
    assert.equal(refreshIntervalMs(undefined), fallback);
  });
});
