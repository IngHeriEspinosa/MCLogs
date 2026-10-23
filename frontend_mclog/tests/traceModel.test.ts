import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTraceModel, collapseRepeats, laneKey, matchesTraceFilter, NO_FILTER } from "@/common/trace/model";
import type { LogEntry } from "@/hooks/useAuth";

const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
let nextId = 1;
const log = (offsetMs: number, overrides: Partial<LogEntry> = {}): LogEntry => ({
  id: nextId++,
  timestamp: new Date(T0 + offsetMs).toISOString(),
  application: "tienda",
  service: "web",
  level: "info",
  environment: "production",
  message: "paso",
  ...overrides,
});

describe("modelo de la traza", () => {
  it("arma carriles en orden de aparicion y la ruta sin repetir consecutivos", () => {
    const logs = [
      log(0),
      log(100, { service: "pagos", level: "warn" }),
      log(150, { service: "pagos", level: "error", message: "rechazado" }),
      log(2000, { host: "web-02" }),
    ];
    const model = buildTraceModel(logs);
    assert.deepEqual(
      model.lanes.map((lane) => [lane.key, lane.count, lane.errors, lane.warnings]),
      [
        ["tienda › web", 2, 0, 0],
        ["tienda › pagos", 2, 1, 1],
      ],
    );
    assert.deepEqual(model.route, ["tienda › web", "tienda › pagos", "tienda › web"]);
    assert.equal(model.status, "failed");
    assert.equal(model.firstErrorIndex, 2);
    assert.deepEqual(model.largestGap, { index: 3, ms: 1850 });
    assert.equal(model.durationMs, 2000);
    assert.deepEqual(model.hosts, ["web-02"]);
  });

  it("el estado distingue correcta, con avisos y fallida", () => {
    assert.equal(buildTraceModel([log(0)]).status, "ok");
    assert.equal(buildTraceModel([log(0), log(1, { level: "warn" })]).status, "warn");
  });

  it("anida los tramos por su padre y deja en la raiz los padres que no llegaron", () => {
    const logs = [
      log(0, { spanId: "a" }),
      log(1, { spanId: "b", parentSpanId: "a" }),
      log(2, { spanId: "c", parentSpanId: "b" }),
      log(3, { spanId: "d", parentSpanId: "fuera" }),
      log(4),
      // Un ciclo no cuelga el calculo.
      log(5, { spanId: "x", parentSpanId: "y" }),
      log(6, { spanId: "y", parentSpanId: "x" }),
    ];
    assert.deepEqual(buildTraceModel(logs).depth, [0, 1, 2, 0, 0, 1, 1]);
  });

  it("el carril es la aplicacion sola si el servicio coincide o falta", () => {
    assert.equal(laneKey({ application: "netsuite", service: "netsuite" }), "netsuite");
    assert.equal(laneKey({ application: "netsuite", service: null }), "netsuite");
  });
});

describe("plegado de repeticiones", () => {
  it("junta pasos seguidos del mismo nivel, carril y mensaje aunque cambien las cifras", () => {
    const logs = [
      log(0, { message: "Procesando linea 1" }),
      log(1, { message: "Procesando linea 2" }),
      log(2, { message: "Procesando linea 3" }),
      log(3, { message: "Fin" }),
      log(4, { message: "Procesando linea 4" }),
    ];
    assert.deepEqual(collapseRepeats(logs), [
      { index: 0, count: 3 },
      { index: 3, count: 1 },
      { index: 4, count: 1 },
    ]);
  });

  it("no pliega el primer error, para que se pueda saltar a el", () => {
    const logs = [log(0, { level: "error", message: "x" }), log(1, { level: "error", message: "x" }), log(2, { level: "error", message: "x" })];
    assert.deepEqual(collapseRepeats(logs, 0), [
      { index: 0, count: 1 },
      { index: 1, count: 2 },
    ]);
  });
});

describe("filtro de la traza", () => {
  const entry = log(0, { level: "warn", message: "Reintento del cobro" });

  it("por nivel minimo, carril y texto", () => {
    assert.equal(matchesTraceFilter(entry, NO_FILTER), true);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, level: "warn" }), true);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, level: "error" }), false);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, lane: "tienda › web" }), true);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, lane: "otro" }), false);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, text: "COBRO" }), true);
    assert.equal(matchesTraceFilter(entry, { ...NO_FILTER, text: "factura" }), false);
  });
});
