import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPrefs,
  DEFAULT_SECTIONS,
  parsePrefs,
  type ReportOptions,
  serializePrefs,
} from "@/common/reports/options";

const base: ReportOptions = {
  kind: "markdown",
  locale: "es",
  range: { preset: "24h" },
  sections: [...DEFAULT_SECTIONS],
  maxGroups: 10,
  includeStacks: true,
  stackLines: 20,
  redact: false,
  objective: "triage",
  instructions: "",
};

describe("parsePrefs", () => {
  it("devuelve vacio con JSON roto o ausente", () => {
    assert.deepEqual(parsePrefs(null), {});
    assert.deepEqual(parsePrefs("{no json"), {});
    assert.deepEqual(parsePrefs("[1,2]"), {});
  });

  it("descarta campo a campo lo que no es valido", () => {
    const prefs = parsePrefs(JSON.stringify({ kind: "pdf", locale: "fr", maxGroups: 7, stackLines: 40, redact: "yes", objective: "incident" }));
    assert.deepEqual(prefs, { stackLines: 40, objective: "incident" });
  });

  it("ida y vuelta conserva las preferencias", () => {
    const options: ReportOptions = { ...base, kind: "agent-md", sections: ["summary", "warnGroups"], maxGroups: 20, redact: true };
    const prefs = parsePrefs(serializePrefs(options));
    assert.equal(prefs.kind, "agent-md");
    assert.deepEqual(prefs.sections, ["summary", "warnGroups"]);
    assert.equal(prefs.maxGroups, 20);
    assert.equal(prefs.redact, true);
  });

  it("anade las secciones por defecto que no existian al guardar", () => {
    const prefs = parsePrefs(
      JSON.stringify({ sections: ["summary"], knownSections: ["summary", "activity", "levels", "applications", "errorGroups", "recentErrors"] }),
    );
    // "comparison" es nueva y va por defecto; "warnGroups" es nueva pero opcional.
    assert.deepEqual(prefs.sections, ["summary", "comparison"]);
  });

  it("respeta que se quitara una seccion que ya existia", () => {
    const prefs = parsePrefs(serializePrefs({ ...base, sections: ["summary"] }));
    assert.deepEqual(prefs.sections, ["summary"]);
  });
});

describe("applyPrefs", () => {
  it("aplica lo guardado sobre la URL", () => {
    assert.equal(applyPrefs(base, { maxGroups: 50 }, false).maxGroups, 50);
  });

  it("un kind en la URL gana y, si es para IA, entra enmascarado", () => {
    const merged = applyPrefs({ ...base, kind: "agent-md" }, { kind: "markdown", redact: false }, true);
    assert.equal(merged.kind, "agent-md");
    assert.equal(merged.redact, true);
  });

  it("sin kind en la URL se respeta el enmascarado guardado", () => {
    assert.equal(applyPrefs(base, { kind: "agent-json", redact: false }, false).redact, false);
  });
});
