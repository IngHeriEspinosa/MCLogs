// Copia el skill de IA desde su fuente canonica (docs/skills/mclog/SKILL.md)
// a Back_MCLog/skill/SKILL.md, que es la copia que entra en la imagen Docker.
// Ejecutar tras editar el skill: `npm run sync:skill`.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(backendDir, "..", "docs", "skills", "mclog", "SKILL.md");
const target = resolve(backendDir, "skill", "SKILL.md");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Skill sincronizado: ${source} -> ${target}`);
