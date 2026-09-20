import { Prisma } from "@prisma/client";
import type { AlertChannel, AlertRule, Log } from "@prisma/client";
import { config } from "../config/env";
import logger from "../config/logger";
import { prisma } from "../config/prisma";
import { deliverToChannels } from "./notifiers";
import type { AlertPayload, AlertSample } from "./types";

/**
 * Motor de alertas.
 *
 * Lo invoca el planificador cada minuto. Recorre las reglas activas, comprueba
 * si su condición se cumple y, si se cumple, avisa por sus canales y lo deja
 * registrado.
 */

const MINUTE_MS = 60 * 1000;
const MAX_SAMPLES = 5;

/** Niveles que cuentan para una regla: el indicado y los más graves. */
const LEVELS_AT_OR_ABOVE: Record<string, string[]> = {
  debug: ["debug", "info", "warn", "error"],
  info: ["info", "warn", "error"],
  warn: ["warn", "error"],
  error: ["error"],
};

const ruleWhere = (rule: AlertRule, from: Date): Prisma.LogWhereInput => ({
  timestamp: { gte: from },
  level: { in: (LEVELS_AT_OR_ABOVE[rule.level] ?? ["error"]) as never[] },
  ...(rule.application ? { application: rule.application } : {}),
  ...(rule.service ? { service: rule.service } : {}),
  ...(rule.environment ? { environment: rule.environment } : {}),
});

const toSample = (log: Log): AlertSample => ({
  id: log.id,
  timestamp: log.timestamp.toISOString(),
  application: log.application,
  service: log.service,
  level: log.level,
  message: log.message.length > 300 ? `${log.message.slice(0, 300)}…` : log.message,
  errorName: log.errorName,
});

/**
 * Enlace al dashboard con los filtros de la regla ya aplicados, para que quien
 * reciba el aviso llegue a los registros en un clic y no tenga que reconstruir
 * la búsqueda.
 */
const dashboardLink = (rule: AlertRule): string | null => {
  if (!config.publicDashboardUrl) return null;
  const params = new URLSearchParams({ level: rule.level });
  if (rule.application) params.set("application", rule.application);
  if (rule.environment) params.set("environment", rule.environment);
  return `${config.publicDashboardUrl}/?${params.toString()}`;
};

/** Evalúa una regla de umbral: N o más coincidencias en la ventana. */
const evaluateThreshold = async (rule: AlertRule, from: Date) => {
  const where = ruleWhere(rule, from);
  const count = await prisma.log.count({ where });
  if (count < rule.threshold) return null;

  const samples = await prisma.log.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: MAX_SAMPLES,
  });
  return { count, samples: samples.map(toSample) };
};

/**
 * Evalúa una regla de error nuevo: huellas cuya **primera** aparición cae
 * dentro de la ventana. Es la diferencia entre "esto falla mucho" y "esto no
 * fallaba antes", que suele ser la señal más accionable tras un despliegue.
 */
const evaluateNewErrorGroup = async (rule: AlertRule, from: Date) => {
  const condiciones: Prisma.Sql[] = [Prisma.sql`"fingerprint" IS NOT NULL`];
  if (rule.application) condiciones.push(Prisma.sql`"application" = ${rule.application}`);
  if (rule.service) condiciones.push(Prisma.sql`"service" = ${rule.service}`);
  if (rule.environment) condiciones.push(Prisma.sql`"environment" = ${rule.environment}::"Environment"`);
  condiciones.push(
    Prisma.sql`"level" IN (${Prisma.join((LEVELS_AT_OR_ABOVE[rule.level] ?? ["error"]).map((nivel) => Prisma.sql`${nivel}::"LogLevel"`))})`,
  );

  // HAVING MIN(timestamp) >= from: el grupo entero es nuevo, no basta con que
  // tenga alguna ocurrencia reciente.
  const nuevos = await prisma.$queryRaw<Array<{ fingerprint: string; lastLogId: number }>>`
    SELECT "fingerprint", MAX("id")::int AS "lastLogId"
    FROM "Log"
    WHERE ${Prisma.join(condiciones, " AND ")}
    GROUP BY "fingerprint"
    HAVING MIN("timestamp") >= ${from}
    LIMIT 50
  `;

  if (nuevos.length < rule.threshold) return null;

  const samples = await prisma.log.findMany({
    where: { id: { in: nuevos.slice(0, MAX_SAMPLES).map((fila) => Number(fila.lastLogId)) } },
    orderBy: { timestamp: "desc" },
  });
  return { count: nuevos.length, samples: samples.map(toSample) };
};

type RuleWithChannels = AlertRule & { channels: AlertChannel[] };

/** Comprueba una regla y, si procede, avisa. Devuelve true si se disparó. */
export const evaluateRule = async (rule: RuleWithChannels, now = new Date()): Promise<boolean> => {
  // Cooldown: tras avisar, la regla calla un rato. Sin esto, un incidente que
  // dura una hora generaría sesenta avisos idénticos.
  if (rule.lastTriggeredAt && now.getTime() - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * MINUTE_MS) {
    return false;
  }

  const from = new Date(now.getTime() - rule.windowMinutes * MINUTE_MS);
  const resultado =
    rule.type === "new_error_group" ? await evaluateNewErrorGroup(rule, from) : await evaluateThreshold(rule, from);

  if (!resultado) return false;

  const payload: AlertPayload = {
    rule: { id: rule.id, name: rule.name, type: rule.type },
    triggeredAt: now.toISOString(),
    count: resultado.count,
    windowMinutes: rule.windowMinutes,
    threshold: rule.threshold,
    application: rule.application,
    environment: rule.environment,
    level: rule.level,
    samples: resultado.samples,
    dashboardUrl: dashboardLink(rule),
  };

  const activos = rule.channels.filter((channel) => channel.enabled);
  const deliveries = await deliverToChannels(activos, payload);

  // El cooldown arranca aunque falle el envío: reintentar cada minuto contra un
  // canal caído solo multiplica el ruido cuando vuelva.
  await prisma.$transaction([
    prisma.alertEvent.create({
      data: {
        ruleId: rule.id,
        triggeredAt: now,
        count: resultado.count,
        sampleLogIds: resultado.samples.map((sample) => sample.id),
        deliveries: deliveries as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.alertRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: now } }),
  ]);

  logger.info("Alert triggered", {
    rule: rule.name,
    count: resultado.count,
    channels: deliveries.length,
    failed: deliveries.filter((entrega) => !entrega.ok).length,
  });

  return true;
};

/** Evalúa todas las reglas activas. No lanza: un fallo en una no frena las demás. */
export const evaluateRules = async (now = new Date()): Promise<number> => {
  const rules = await prisma.alertRule.findMany({ where: { enabled: true }, include: { channels: true } });
  let disparadas = 0;

  for (const rule of rules) {
    try {
      if (await evaluateRule(rule, now)) disparadas += 1;
    } catch (error) {
      logger.error("Alert rule evaluation failed", { rule: rule.name, error: String(error) });
    }
  }
  return disparadas;
};

/** Envía un aviso de prueba por un canal, para validarlo al configurarlo. */
export const sendTestAlert = async (channel: AlertChannel) => {
  const payload: AlertPayload = {
    rule: { id: 0, name: "Prueba de configuración", type: "threshold" },
    triggeredAt: new Date().toISOString(),
    count: 1,
    windowMinutes: 10,
    threshold: 1,
    application: null,
    environment: null,
    level: "error",
    samples: [
      {
        id: 0,
        timestamp: new Date().toISOString(),
        application: "mclog",
        service: "alertas",
        level: "error",
        message: "Este es un aviso de prueba. Si lo recibes, el canal funciona.",
        errorName: null,
      },
    ],
    dashboardUrl: config.publicDashboardUrl || null,
  };

  const [delivery] = await deliverToChannels([channel], payload);
  return delivery;
};
