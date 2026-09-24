import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeGroups } from "@/common/errors/summary";

describe("summarizeGroups", () => {
  it("suma ocurrencias, elige la aplicacion mas afectada y la concentracion", () => {
    const summary = summarizeGroups([
      { application: "billing", count: 6 },
      { application: "gateway", count: 3 },
      { application: "billing", count: 1 },
    ]);
    assert.deepEqual(summary, { occurrences: 10, max: 6, topApp: { application: "billing", count: 7 }, topShare: 0.6 });
  });

  it("sin grupos no divide por cero ni inventa una aplicacion", () => {
    assert.deepEqual(summarizeGroups([]), { occurrences: 0, max: 1, topApp: null, topShare: 0 });
  });
});
