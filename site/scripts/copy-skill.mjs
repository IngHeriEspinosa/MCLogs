// Copia el skill de IA (docs/skills/mclog/SKILL.md) a public/ para que el sitio
// lo ofrezca como descarga en /MCLogs/mclog-SKILL.md. La copia no se versiona:
// se regenera antes de cada `dev` y `build`, asi que la fuente sigue siendo docs/.
import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(siteDir, "..", "docs", "skills", "mclog", "SKILL.md");
const target = resolve(siteDir, "public", "mclog-SKILL.md");

copyFileSync(source, target);
console.log(`Skill copiado a ${target}`);
