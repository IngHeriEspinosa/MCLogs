import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";

const BACKEND_COPY = path.resolve(__dirname, "..", "skill", "SKILL.md");
const CANONICAL = path.resolve(__dirname, "..", "..", "docs", "skills", "mclog", "SKILL.md");

describe("Descarga del skill de IA", () => {
  it("GET /api/skill lo sirve sin credenciales como descarga Markdown", async () => {
    const res = await request(app).get("/api/skill");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/markdown/);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="mclog-SKILL.md"');
    expect(res.text).toBe(fs.readFileSync(BACKEND_COPY, "utf8"));
  });

  it("empieza por el frontmatter que exigen los skills", async () => {
    const res = await request(app).get("/api/skill");
    // \r? para que pase tambien en un checkout de Windows con autocrlf.
    const frontmatter = res.text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter![1]).toMatch(/^name: mclog\r?$/m);
    const description = frontmatter![1].match(/^description: (.+?)\r?$/m)?.[1] ?? "";
    // Limite de la especificacion de Agent Skills.
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  // La imagen Docker solo ve la copia del backend: si alguien edita el skill en
  // docs/ y olvida `npm run sync:skill`, el MCP serviria una version vieja.
  it.skipIf(!fs.existsSync(CANONICAL))("la copia del backend coincide con docs/skills/mclog/SKILL.md", () => {
    expect(fs.readFileSync(BACKEND_COPY, "utf8")).toBe(fs.readFileSync(CANONICAL, "utf8"));
  });
});
