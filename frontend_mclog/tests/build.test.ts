import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReport, occurrencesUrl, trendOf } from "@/common/reports/build";
import type { ReportData } from "@/common/reports/collect";
import { DEFAULT_SECTIONS, REPORT_SECTIONS, type ReportOptions } from "@/common/reports/options";
import type { ErrorGroup } from "@/hooks/useErrors";

const HOUR = 3_600_000;
const FROM = "2026-09-22T00:00:00.000Z";
const TO = "2026-09-23T00:00:00.000Z";

const group = (fingerprint: string, count: number, extra: Partial<ErrorGroup> = {}): ErrorGroup => ({
  fingerprint,
  application: "billing",
  service: null,
  level: "error",
  errorName: `Error${fingerprint}`,
  errorCode: null,
  sampleMessage: `failed for ana@example.com (${fingerprint})`,
  lastLogId: count,
  count,
  firstSeen: FROM,
  lastSeen: TO,
  ...extra,
});

const hours = Array.from({ length: 24 }, (_, index) => {
  const start = Date.parse(FROM) + index * HOUR;
  return { start, end: start + HOUR, error: 1, warn: 1, info: 2, debug: 0, total: 4 };
});

const data = (overrides: Partial<ReportData> = {}): ReportData => ({
  generatedAt: TO,
  from: FROM,
  to: TO,
  origin: "https://mclog.example.com",
  hours,
  totals: { total: 96, error: 24, warn: 24, info: 48, debug: 0 },
  groups: [group("a", 12), group("b", 8), group("c", 4)],
  groupsCapped: false,
  samples: {},
  recentErrors: [],
  applications: [
    { application: "billing", services: ["api"], environments: ["production"], count: 96, lastSeen: TO, errorsLast24h: 24 },
  ],
  applicationsSince: FROM,
  warnGroups: [group("w", 30, { level: "warn", errorName: null })],
  previous: {
    from: "2026-09-21T00:00:00.000Z",
    to: FROM,
    totals: { total: 80, error: 10, warn: 20, info: 50, debug: 0 },
    // "a" empeora (3 -> 12), "c" no estaba (nuevo), "z" desaparece.
    groups: [group("a", 3), group("b", 8), group("z", 5)],
    groupsCapped: false,
  },
  ...overrides,
});

const options = (overrides: Partial<ReportOptions> = {}): ReportOptions => ({
  kind: "markdown",
  locale: "es",
  range: { preset: "24h" },
  sections: [...DEFAULT_SECTIONS],
  maxGroups: 10,
  includeStacks: false,
  stackLines: 20,
  redact: true,
  objective: "regression",
  instructions: "",
  ...overrides,
});

const agentJson = (reportData: ReportData, overrides: Partial<ReportOptions> = {}) =>
  JSON.parse(buildReport(reportData, options({ kind: "agent-json", ...overrides })).content);

describe("trendOf", () => {
  it("clasifica nuevo, empeora, mejora, estable y sin dato", () => {
    assert.equal(trendOf(5, 0), "new");
    assert.equal(trendOf(12, 3), "up");
    assert.equal(trendOf(2, 10), "down");
    assert.equal(trendOf(2, 1), "flat", "de 1 a 2 no es empeorar");
    assert.equal(trendOf(110, 100), "flat", "un 10 % tampoco");
    assert.equal(trendOf(5, null), "unknown");
  });
});

describe("comparacion con el periodo anterior", () => {
  it("marca nuevos, empeorados y desaparecidos en el JSON", () => {
    const report = agentJson(data(), { sections: [...REPORT_SECTIONS] });
    const comparison = report.data.comparison;
    assert.deepEqual(comparison.new_failures.map((item: { fingerprint: string }) => item.fingerprint), ["c"]);
    assert.deepEqual(comparison.worsened_failures.map((item: { fingerprint: string }) => item.fingerprint), ["a"]);
    assert.deepEqual(comparison.gone_failures.map((item: { fingerprint: string }) => item.fingerprint), ["z"]);
    assert.deepEqual(comparison.logs_error, { previous: 10, current: 24 });

    const byFingerprint = Object.fromEntries(
      report.data.error_groups.map((item: { fingerprint: string; trend: string; previous_occurrences: number }) => [item.fingerprint, item]),
    );
    assert.equal(byFingerprint.a.trend, "up");
    assert.equal(byFingerprint.a.previous_occurrences, 3);
    assert.equal(byFingerprint.b.trend, "flat");
    assert.equal(byFingerprint.c.trend, "new");
  });

  it("si el periodo anterior llego al tope, lo ausente es 'unknown' y no 'new'", () => {
    const base = data();
    const report = agentJson(data({ previous: { ...base.previous!, groupsCapped: true } }));
    const c = report.data.error_groups.find((item: { fingerprint: string }) => item.fingerprint === "c");
    assert.equal(c.trend, "unknown");
    assert.equal(c.previous_occurrences, null);
    assert.equal(report.data.comparison.new_failures.length, 0);
  });

  it("si la ventana actual llego al tope, no afirma que nada desaparecio", () => {
    const report = agentJson(data({ groupsCapped: true }));
    assert.equal(report.data.comparison.gone_failures, null);
  });

  it("sin la seccion, no hay comparacion ni tendencia", () => {
    const report = agentJson(data(), { sections: ["summary", "errorGroups"] });
    assert.equal(report.data.comparison, null);
    assert.equal(report.data.error_groups[0].trend, null);
    assert.ok(!report.instructions.rules.some((rule: string) => rule.includes("`trend`")));
  });

  it("el informe para personas lista nuevos y empeorados", () => {
    const { content } = buildReport(data(), options());
    assert.match(content, /## Comparación con el periodo anterior/);
    assert.match(content, /### Fallos nuevos \(1\)/);
    assert.match(content, /### Fallos que empeoraron \(1\)/);
    assert.match(content, /### Fallos que dejaron de aparecer \(1\)/);
  });
});

describe("buildReport", () => {
  it("el resumen para agentes cuenta los fallos distintos aunque falten secciones", () => {
    const report = agentJson(data(), { sections: ["levels"] });
    assert.equal(report.data.summary.distinct_failures, 3);
    assert.equal(report.schema, "mclog.agent-report/v2");
  });

  it("las aplicaciones llevan los errores de la ventana y desde cuando se cuentan", () => {
    const report = agentJson(data(), { sections: ["applications"] });
    assert.equal(report.data.applications.logs_counted_since, FROM);
    assert.equal(report.data.applications.rows[0].errors_in_window, 24);
    assert.equal(report.data.applications.rows[0].logs_since, 96);
  });

  it("incluye warnings agrupados solo si se piden", () => {
    assert.equal(agentJson(data()).data.warning_groups, null);
    assert.equal(agentJson(data(), { sections: ["warnGroups"] }).data.warning_groups[0].occurrences, 30);
  });

  it("cuenta lo enmascarado, y null si no se enmascara", () => {
    const masked = buildReport(data(), options({ sections: ["errorGroups"] }));
    assert.equal(masked.redactions, 3, "un correo por cada fallo");
    assert.ok(!masked.content.includes("ana@example.com"));
    const plain = buildReport(data(), options({ sections: ["errorGroups"], redact: false }));
    assert.equal(plain.redactions, null);
    assert.ok(plain.content.includes("ana@example.com"));
  });

  it("la regla de contenido no fiable va primera y la de enmascarado solo si se enmascara", () => {
    const rules = agentJson(data()).instructions.rules as string[];
    assert.match(rules[0], /<mclog_data>/);
    assert.ok(rules.some((rule) => rule.includes("[REDACTED")));
    const unmasked = agentJson(data(), { redact: false }).instructions.rules as string[];
    assert.ok(!unmasked.some((rule) => rule.includes("[REDACTED")));
  });

  it("enlaza cada fallo con sus ocurrencias en MCLog", () => {
    const { content } = buildReport(data(), options({ sections: ["errorGroups"] }));
    const url = occurrencesUrl(data(), "a");
    assert.ok(url && content.includes(`(${url})`));
    assert.equal(occurrencesUrl({ origin: "", from: FROM, to: TO }, "a"), null);
  });

  it("el brief en Markdown encierra los datos en <mclog_data>", () => {
    const { content } = buildReport(data(), options({ kind: "agent-md", sections: [...REPORT_SECTIONS] }));
    const open = content.indexOf("<mclog_data>");
    assert.ok(open > 0 && content.indexOf("</mclog_data>") > open);
    assert.ok(content.indexOf("### comparison") > open);
  });
});
