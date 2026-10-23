import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previousWindow, relativeChange, trendOf } from "@/common/metrics/compare";
import { buildReport } from "@/common/reports/build";
import type { ReportData } from "@/common/reports/collect";
import type { ReportOptions } from "@/common/reports/options";
import type { ErrorGroup } from "@/hooks/useErrors";

const FROM = "2026-09-22T00:00:00.000Z";
const TO = "2026-09-23T00:00:00.000Z";

describe("comparacion con el periodo anterior", () => {
  it("el cambio relativo no tiene base si antes no habia nada", () => {
    assert.equal(relativeChange(15, 10), 0.5);
    assert.equal(relativeChange(5, 10), -0.5);
    assert.equal(relativeChange(3, 0), null);
  });

  it("el periodo anterior tiene la misma duracion y acaba donde empieza el actual", () => {
    const window = previousWindow(new Date(FROM), new Date(TO));
    assert.equal(window.from.toISOString(), "2026-09-21T00:00:00.000Z");
    assert.equal(window.to.toISOString(), FROM);
  });

  it("trendOf sigue en su sitio para quien lo importaba", () => {
    assert.equal(trendOf(12, 3), "up");
  });
});

const regressed: ErrorGroup = {
  fingerprint: "volvio",
  application: "billing",
  service: null,
  level: "error",
  errorName: "TimeoutError",
  errorCode: null,
  sampleMessage: "Timeout",
  lastLogId: 1,
  count: 4,
  firstSeen: FROM,
  lastSeen: TO,
  status: "active",
  regressionCount: 1,
  lastRegressedAt: "2026-09-22T10:00:00.000Z",
};

const data: ReportData = {
  generatedAt: TO,
  from: FROM,
  to: TO,
  origin: "https://mclog.example.com",
  hours: [],
  totals: { total: 10, error: 4, warn: 0, info: 6, debug: 0 },
  groups: [regressed],
  groupsCapped: false,
  samples: {},
  recentErrors: [],
  applications: [],
  applicationsSince: null,
  lifecycle: { newInWindow: 2, regressedInWindow: 1, resolvedInWindow: 3, mttrMs: 2 * 3_600_000 },
  regressed: [regressed],
  latency: [{ application: "billing", service: "api", count: 50, p50: 120, p95: 900, p99: 1500, max: 2000 }],
  releases: [{ application: "billing", release: "2.4.1", firstSeen: FROM, lastSeen: TO, count: 10, errors: 4, newGroups: 1 }],
  warnGroups: [],
  previous: null,
};

const options: ReportOptions = {
  kind: "markdown",
  locale: "es",
  range: { preset: "24h" },
  sections: ["lifecycle", "latency", "releases"],
  maxGroups: 10,
  includeStacks: false,
  stackLines: 20,
  redact: false,
  objective: "regression",
  instructions: "",
};

describe("reporte con ciclo de vida, latencia y releases", () => {
  it("el informe lleva las tres secciones con sus cifras", () => {
    const { content } = buildReport(data, options);
    assert.match(content, /## Ciclo de vida de los fallos/);
    assert.match(content, /Tiempo medio hasta resolver \| 2 h/);
    assert.match(content, /Fallos que volvieron tras resolverse \(1\)/);
    assert.match(content, /## Latencia/);
    assert.match(content, /`billing › api` \| 120 ms \| 900 ms \| 1,5 s/);
    assert.match(content, /`2\.4\.1`/);
  });

  it("los datos para agentes las llevan con sus nombres", () => {
    const payload = JSON.parse(buildReport(data, { ...options, kind: "agent-json" }).content).data;
    assert.deepEqual(
      { new: payload.lifecycle.new_in_window, regressed: payload.lifecycle.regressed_in_window, mttr: payload.lifecycle.mttr_ms },
      { new: 2, regressed: 1, mttr: 7_200_000 },
    );
    assert.equal(payload.lifecycle.regressed_failures[0].fingerprint, "volvio");
    assert.equal(payload.latency[0].p95, 900);
    assert.equal(payload.releases[0].release, "2.4.1");
  });

  it("sin datos de latencia ni releases, sus secciones no salen", () => {
    const { content } = buildReport({ ...data, latency: [], releases: [] }, options);
    assert.doesNotMatch(content, /## Latencia/);
    assert.doesNotMatch(content, /## Releases/);
  });
});
