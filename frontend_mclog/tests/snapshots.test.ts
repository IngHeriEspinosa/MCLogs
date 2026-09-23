import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paginate, sortLogs, toSnapshotFilters } from "@/common/snapshots/view";
import type { LogEntry } from "@/hooks/useAuth";

const log = (id: number, extra: Partial<LogEntry>): LogEntry => ({
  id,
  timestamp: "2026-09-23T10:00:00.000Z",
  application: "app",
  level: "info",
  environment: "production",
  message: `log ${id}`,
  ...extra,
});

const logs = [
  log(1, { timestamp: "2026-09-23T10:00:01.000Z", level: "warn", application: "billing" }),
  log(2, { timestamp: "2026-09-23T10:00:03.000Z", level: "debug", application: "api", host: "b" }),
  log(3, { timestamp: "2026-09-23T10:00:02.000Z", level: "error", application: "worker", host: "a" }),
  log(4, { timestamp: "2026-09-23T10:00:02.000Z", level: "error", application: "api" }),
];

describe("sortLogs", () => {
  it("ordena por fecha y desempata por id en la misma direccion", () => {
    assert.deepEqual(sortLogs(logs, "timestamp", "desc").map((l) => l.id), [2, 4, 3, 1]);
    assert.deepEqual(sortLogs(logs, "timestamp", "asc").map((l) => l.id), [1, 3, 4, 2]);
  });

  it("ordena los niveles por gravedad, no alfabeticamente", () => {
    assert.deepEqual(sortLogs(logs, "level", "desc").map((l) => l.level), ["error", "error", "warn", "debug"]);
  });

  it("ordena texto y deja los vacios al principio en ascendente", () => {
    assert.deepEqual(sortLogs(logs, "application", "asc").map((l) => l.application), ["api", "api", "billing", "worker"]);
    assert.deepEqual(sortLogs(logs, "host", "asc").map((l) => l.id), [1, 4, 3, 2]);
  });

  it("no modifica la lista original", () => {
    const before = logs.map((l) => l.id);
    sortLogs(logs, "level", "asc");
    assert.deepEqual(logs.map((l) => l.id), before);
  });
});

describe("paginate", () => {
  it("corta la pagina pedida", () => {
    assert.deepEqual(paginate([1, 2, 3, 4, 5], 2, 2), { rows: [3, 4], page: 2, totalPages: 3 });
  });

  it("ajusta una pagina fuera de rango y nunca da cero paginas", () => {
    assert.deepEqual(paginate([1, 2, 3], 9, 2), { rows: [3], page: 2, totalPages: 2 });
    assert.deepEqual(paginate([], 1, 25), { rows: [], page: 1, totalPages: 1 });
  });
});

describe("toSnapshotFilters", () => {
  const filters = {
    range: { preset: "24h" as const },
    level: "error",
    environment: "",
    application: "billing",
    search: "",
    fingerprint: "",
    message: "timeout",
    service: "",
    host: "",
    traceId: "",
    errorName: "",
    errorCode: "",
    sortField: "timestamp" as const,
    sortDir: "desc" as const,
    page: 3,
    pageSize: 25,
  };
  const resolved = { from: new Date("2026-09-22T10:00:00.000Z") };

  it("manda el rango en fechas, sin vacios ni paginacion", () => {
    assert.deepEqual(toSnapshotFilters(filters, resolved, false), {
      application: "billing",
      level: "error",
      from: "2026-09-22T10:00:00.000Z",
      to: undefined,
      sortField: "timestamp",
      sortDir: "desc",
    });
  });

  it("solo Registros manda la busqueda por campo", () => {
    assert.equal(toSnapshotFilters(filters, resolved, true).message, "timeout");
    assert.equal(toSnapshotFilters(filters, resolved, false).message, undefined);
  });
});
