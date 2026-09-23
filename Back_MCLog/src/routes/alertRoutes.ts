import express, { RequestHandler, Response } from "express";
import type { AlertChannel, Prisma } from "@prisma/client";
import { body, param, query, validationResult } from "express-validator";
import logger from "../config/logger";
import { prisma } from "../config/prisma";
import { sendTestAlert } from "../alerts/evaluator";
import { AuthenticatedRequest, requireAuth } from "../middlewares/requireAuth";
import { requireWorkspaceOwner, workspaceIdOf } from "../middlewares/workspaceContext";
import { queryLimiter } from "../middlewares/rateLimiters";

const router = express.Router();

const CHANNEL_TYPES = ["webhook", "email", "telegram"] as const;
const RULE_TYPES = ["threshold", "new_error_group"] as const;
const LEVELS = ["debug", "info", "warn", "error"] as const;
const ENVIRONMENTS = ["development", "staging", "production"] as const;

const handleValidation: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: "error", errors: errors.mapped() });
    return;
  }
  next();
};

/**
 * Oculta los secretos antes de devolver un canal.
 *
 * Un `secret` de webhook o el token de un bot valen tanto como una contraseña:
 * quien los tenga puede suplantar los avisos o usar el bot. Se envía solo lo
 * justo para reconocer que están puestos.
 */
const maskChannel = (channel: AlertChannel) => {
  const config = { ...((channel.config as Record<string, unknown>) ?? {}) };

  if (typeof config.secret === "string" && config.secret !== "") config.secret = "********";
  if (typeof config.botToken === "string" && config.botToken !== "") {
    config.botToken = `${config.botToken.slice(0, 6)}********`;
  }
  return { ...channel, config };
};

/**
 * Mezcla la configuración entrante con la guardada, conservando los secretos
 * que llegan enmascarados. Sin esto, editar el nombre de un canal desde la
 * interfaz borraría su token, porque el formulario devuelve la máscara.
 */
const mergeConfig = (previous: Record<string, unknown>, incoming: Record<string, unknown>) => {
  const merged = { ...previous, ...incoming };
  for (const campo of ["secret", "botToken"]) {
    if (typeof incoming[campo] === "string" && /^\W*$|\*{4,}/.test(String(incoming[campo]))) {
      merged[campo] = previous[campo];
    }
  }
  return merged;
};

const validateChannelConfig = (type: string, config: Record<string, unknown>): string | null => {
  if (type === "webhook") {
    const url = config.url;
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return "webhook requiere una url http(s)";
  }
  if (type === "email") {
    const to = config.to;
    if (!Array.isArray(to) || to.length === 0 || to.some((valor) => typeof valor !== "string")) {
      return "email requiere `to` con al menos un destinatario";
    }
  }
  if (type === "telegram") {
    if (typeof config.botToken !== "string" || typeof config.chatId !== "string") {
      return "telegram requiere botToken y chatId";
    }
  }
  return null;
};

// Canales, reglas e historial son del espacio activo y solo los gestiona su
// dueño. Cada busqueda por id va acotada al espacio: un id de otro espacio se
// responde como inexistente.
router.use(queryLimiter, requireAuth, requireWorkspaceOwner);

/**
 * Comprueba que todos los canales pertenecen al espacio. Sin esto, una regla
 * podria enlazar el canal de otro espacio y mandarle sus avisos.
 */
const channelsBelongTo = async (channelIds: number[], workspaceId: number) => {
  if (channelIds.length === 0) return true;
  const unique = [...new Set(channelIds)];
  const count = await prisma.alertChannel.count({ where: { id: { in: unique }, workspaceId } });
  return count === unique.length;
};

// --- Canales ---

router.get("/channels", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channels = await prisma.alertChannel.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: channels.map(maskChannel) });
  } catch (error) {
    logger.error("Error listing alert channels", { error });
    res.status(500).json({ error: "Error listing alert channels" });
  }
});

router.post(
  "/channels",
  [
    body("name").trim().notEmpty().isLength({ max: 120 }),
    body("type").isIn(CHANNEL_TYPES),
    body("config").isObject(),
    body("enabled").optional().isBoolean(),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const problema = validateChannelConfig(req.body.type, req.body.config);
    if (problema) {
      res.status(400).json({ error: problema });
      return;
    }
    try {
      const channel = await prisma.alertChannel.create({
        data: {
          workspaceId: workspaceIdOf(req),
          name: req.body.name,
          type: req.body.type,
          config: req.body.config,
          enabled: req.body.enabled ?? true,
        },
      });
      logger.info("Alert channel created", { id: channel.id, type: channel.type, by: req.user?.email });
      res.status(201).json({ data: maskChannel(channel) });
    } catch (error) {
      logger.error("Error creating alert channel", { error });
      res.status(500).json({ error: "Error creating alert channel" });
    }
  },
);

router.patch(
  "/channels/:id",
  [
    param("id").isInt({ min: 1 }).toInt(),
    body("name").optional().trim().notEmpty().isLength({ max: 120 }),
    body("config").optional().isObject(),
    body("enabled").optional().isBoolean(),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const existing = await prisma.alertChannel.findFirst({
        where: { id: Number(req.params.id), workspaceId: workspaceIdOf(req) },
      });
      if (!existing) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      const config = req.body.config
        ? mergeConfig((existing.config as Record<string, unknown>) ?? {}, req.body.config)
        : undefined;

      if (config) {
        const problema = validateChannelConfig(existing.type, config);
        if (problema) {
          res.status(400).json({ error: problema });
          return;
        }
      }

      const channel = await prisma.alertChannel.update({
        where: { id: existing.id },
        data: {
          ...(req.body.name !== undefined && { name: req.body.name }),
          ...(req.body.enabled !== undefined && { enabled: req.body.enabled }),
          ...(config && { config: config as Prisma.InputJsonValue }),
        },
      });
      res.json({ data: maskChannel(channel) });
    } catch (error) {
      logger.error("Error updating alert channel", { error });
      res.status(500).json({ error: "Error updating alert channel" });
    }
  },
);

router.delete(
  "/channels/:id",
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { count } = await prisma.alertChannel.deleteMany({
        where: { id: Number(req.params.id), workspaceId: workspaceIdOf(req) },
      });
      if (count === 0) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      logger.info("Alert channel deleted", { id: Number(req.params.id), by: req.user?.email });
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "Channel not found" });
    }
  },
);

/** Envía un aviso de prueba, para comprobar el canal al configurarlo. */
router.post(
  "/channels/:id/test",
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    const channel = await prisma.alertChannel.findFirst({
      where: { id: Number(req.params.id), workspaceId: workspaceIdOf(req) },
    });
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    // El resultado se devuelve siempre con 200: el fallo del canal es el dato
    // que se está pidiendo, no un error de esta petición.
    res.json({ data: await sendTestAlert(channel) });
  },
);

// --- Reglas ---

const ruleInclude = { channels: true } as const;

router.get("/rules", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rules = await prisma.alertRule.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      include: ruleInclude,
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: rules.map((rule) => ({ ...rule, channels: rule.channels.map(maskChannel) })) });
  } catch (error) {
    logger.error("Error listing alert rules", { error });
    res.status(500).json({ error: "Error listing alert rules" });
  }
});

const ruleBodyRules = (optional: boolean) => {
  // `name` es obligatorio al crear y opcional al actualizar; el resto siempre
  // es opcional porque tiene valor por defecto en el modelo.
  const nameRule = optional
    ? body("name").optional().trim().notEmpty().isLength({ max: 120 })
    : body("name").trim().notEmpty().isLength({ max: 120 });

  return [
    nameRule,
    body("type").optional().isIn(RULE_TYPES),
    body("enabled").optional().isBoolean(),
    body("application").optional({ values: "null" }).isString().isLength({ max: 120 }),
    body("service").optional({ values: "null" }).isString().isLength({ max: 120 }),
    body("environment").optional({ values: "null" }).isIn(ENVIRONMENTS),
    body("level").optional().isIn(LEVELS),
    body("threshold").optional().isInt({ min: 1, max: 100000 }).toInt(),
    body("windowMinutes").optional().isInt({ min: 1, max: 1440 }).toInt(),
    body("cooldownMinutes").optional().isInt({ min: 0, max: 1440 }).toInt(),
    body("channelIds").optional().isArray(),
    body("channelIds.*").isInt({ min: 1 }).toInt(),
  ];
};

router.post(
  "/rules",
  [...ruleBodyRules(false), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = workspaceIdOf(req);
      const channelIds: number[] = req.body.channelIds ?? [];
      if (!(await channelsBelongTo(channelIds, workspaceId))) {
        res.status(400).json({ error: "Unknown channel" });
        return;
      }
      const rule = await prisma.alertRule.create({
        data: {
          workspaceId,
          name: req.body.name,
          type: req.body.type ?? "threshold",
          enabled: req.body.enabled ?? true,
          application: req.body.application ?? null,
          service: req.body.service ?? null,
          environment: req.body.environment ?? null,
          level: req.body.level ?? "error",
          threshold: req.body.threshold ?? 1,
          windowMinutes: req.body.windowMinutes ?? 10,
          cooldownMinutes: req.body.cooldownMinutes ?? 30,
          channels: { connect: channelIds.map((id) => ({ id })) },
        },
        include: ruleInclude,
      });
      logger.info("Alert rule created", { id: rule.id, name: rule.name, by: req.user?.email });
      res.status(201).json({ data: { ...rule, channels: rule.channels.map(maskChannel) } });
    } catch (error) {
      logger.error("Error creating alert rule", { error });
      res.status(500).json({ error: "Error creating alert rule" });
    }
  },
);

router.patch(
  "/rules/:id",
  [param("id").isInt({ min: 1 }).toInt(), ...ruleBodyRules(true), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = workspaceIdOf(req);
      const existing = await prisma.alertRule.findFirst({ where: { id: Number(req.params.id), workspaceId } });
      if (!existing) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      if (req.body.channelIds !== undefined && !(await channelsBelongTo(req.body.channelIds, workspaceId))) {
        res.status(400).json({ error: "Unknown channel" });
        return;
      }

      const campos = ["name", "type", "enabled", "application", "service", "environment", "level", "threshold", "windowMinutes", "cooldownMinutes"] as const;
      const data: Record<string, unknown> = {};
      for (const campo of campos) if (req.body[campo] !== undefined) data[campo] = req.body[campo];

      // `set` en lugar de `connect`: la lista que llega es la lista final.
      if (req.body.channelIds !== undefined) {
        data.channels = { set: (req.body.channelIds as number[]).map((id) => ({ id })) };
      }

      const rule = await prisma.alertRule.update({
        where: { id: existing.id },
        data,
        include: ruleInclude,
      });
      res.json({ data: { ...rule, channels: rule.channels.map(maskChannel) } });
    } catch (error) {
      logger.error("Error updating alert rule", { error });
      res.status(500).json({ error: "Error updating alert rule" });
    }
  },
);

router.delete(
  "/rules/:id",
  [param("id").isInt({ min: 1 }).toInt(), handleValidation],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { count } = await prisma.alertRule.deleteMany({
        where: { id: Number(req.params.id), workspaceId: workspaceIdOf(req) },
      });
      if (count === 0) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      logger.info("Alert rule deleted", { id: Number(req.params.id), by: req.user?.email });
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "Rule not found" });
    }
  },
);

// --- Historial ---

router.get(
  "/events",
  [
    query("ruleId").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
    handleValidation,
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const events = await prisma.alertEvent.findMany({
        where: {
          rule: { workspaceId: workspaceIdOf(req) },
          ...(req.query.ruleId ? { ruleId: Number(req.query.ruleId) } : {}),
        },
        orderBy: { triggeredAt: "desc" },
        take: Number(req.query.limit ?? 50),
        include: { rule: { select: { id: true, name: true, type: true } } },
      });
      res.json({ data: events });
    } catch (error) {
      logger.error("Error listing alert events", { error });
      res.status(500).json({ error: "Error listing alert events" });
    }
  },
);

export default router;
