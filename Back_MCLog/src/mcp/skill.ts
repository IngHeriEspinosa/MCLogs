import fs from "node:fs";
import path from "node:path";

/**
 * Skill de instalacion e integracion de MCLog para asistentes de IA.
 *
 * La fuente canonica es `docs/skills/mclog/SKILL.md` en la raiz del repositorio.
 * El contexto Docker del backend no alcanza `docs/`, asi que se mantiene una
 * copia en `Back_MCLog/skill/SKILL.md` (`npm run sync:skill`); un test y la CI
 * fallan si las dos difieren.
 *
 * La ruta se resuelve desde este fichero y no desde `process.cwd()`: vale igual
 * en `src/mcp` (desarrollo y tests) que en `dist/mcp` (imagen Docker).
 */
const SKILL_FILE = path.resolve(__dirname, "..", "..", "skill", "SKILL.md");

/** URI con la que el servidor MCP publica el skill como recurso. */
export const SKILL_URI = "mclog://skill/SKILL.md";
export const SKILL_MIME_TYPE = "text/markdown";
/** Nombre con el que se ofrece la descarga. */
export const SKILL_DOWNLOAD_NAME = "mclog-SKILL.md";

export type SkillScope = "project" | "user";

/** Donde espera Claude Code los skills, segun su alcance. */
export const SKILL_INSTALL_PATHS: Record<SkillScope, string> = {
  project: ".claude/skills/mclog/SKILL.md",
  user: "~/.claude/skills/mclog/SKILL.md",
};

let cached: string | null = null;

/** Contenido del skill. Se lee una vez: el fichero solo cambia con un despliegue. */
export const loadSkill = (): string => {
  if (cached === null) cached = fs.readFileSync(SKILL_FILE, "utf8");
  return cached;
};

/**
 * Instrucciones para que el asistente instale el skill en el equipo del
 * usuario. El servidor MCP no puede escribir ficheros en el cliente: lo hace el
 * propio asistente con sus herramientas, y solo tras confirmarlo el usuario.
 */
export const buildInstallInstructions = (scope: SkillScope = "project"): string =>
  [
    `Instala el skill "mclog" guardando el contenido de abajo, sin modificarlo, en \`${SKILL_INSTALL_PATHS[scope]}\`.`,
    "Antes de escribir, confirma la ruta con el usuario y, si ya existe un fichero ahi, pregunta si lo sobrescribes.",
    `Otras ubicaciones: \`${SKILL_INSTALL_PATHS.project}\` (solo este proyecto) o \`${SKILL_INSTALL_PATHS.user}\` (todos los proyectos del usuario).`,
    "En clientes sin soporte de skills (Cursor, Copilot…), guardalo como regla o instruccion del proyecto (por ejemplo `.cursor/rules/mclog.md` o `AGENTS.md`).",
    "Tras instalarlo, resume en una linea que cubre y sigue sus pasos cuando el usuario quiera instalar MCLog o integrar un sistema.",
  ].join("\n");
