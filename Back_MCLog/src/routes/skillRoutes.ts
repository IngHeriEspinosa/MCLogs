import express, { Request, Response } from "express";
import logger from "../config/logger";
import { queryLimiter } from "../middlewares/rateLimiters";
import { SKILL_DOWNLOAD_NAME, SKILL_MIME_TYPE, loadSkill } from "../mcp/skill";

/**
 * Descarga del skill de IA de MCLog en Markdown.
 *
 * Es publico a proposito: el contenido es la misma documentacion que se publica
 * en el sitio y en GitHub, no expone datos de la instancia ni de ningun espacio.
 * Asi se puede instalar con un solo comando, sin credenciales:
 *
 *   curl <MCLOG_URL>/api/skill -o .claude/skills/mclog/SKILL.md
 *
 * El dashboard lo usa para su boton de descarga.
 */
const router = express.Router();

router.get("/", queryLimiter, (_req: Request, res: Response) => {
  try {
    const skill = loadSkill();
    res.set("Content-Disposition", `attachment; filename="${SKILL_DOWNLOAD_NAME}"`);
    res.type(`${SKILL_MIME_TYPE}; charset=utf-8`).send(skill);
  } catch (error) {
    logger.error("Error reading AI skill file", { error: String(error) });
    res.status(500).json({ error: "Skill not available" });
  }
});

export default router;
