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

const levelsOf = (rule: AlertRule) => LEVELS_AT_OR_ABOVE[rule.level] ?? ["error"];

/**
 * Logs que cuentan para una regla entre `from` y `to`. El límite superior
 * importa: un log fechado en el futuro seguía dentro de la ventana hasta esa
 * fecha y disparaba la regla en cada pasada.
 */
const ruleWhere = (rule: AlertRule, from: Date, to: Date): Prisma.LogWhereInput => ({
  // Una regla solo cuenta los logs de su espacio.
  workspaceId: rule.workspaceId,
  timestamp: { gte: from, lte: to },
  level: { in: levelsOf(rule) as never[] },
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
  fingerprint: log.fingerprint,
  traceId: log.traceId,
});

/**
 * Enlace al dashboard que reproduce lo que contó la regla, para que quien
 * reciba el aviso llegue a esos registros en un clic: su ventana, sus niveles
 * (el de la regla y los más graves), su aplicación, servicio y entorno y, si
 * el aviso es de un único fallo, su huella.
 */
export const dashboardLink = (
  rule: AlertRule,
  window: { from: Date; to: Date },
  fingerprint?: string | null,
): string | null => {
  if (!config.publicDashboardUrl) return null;
  // `ws` hace que el panel abra el espacio de la regla, aunque quien pulse el
  // enlace tuviera otro seleccionado.
  const params = new URLSearchParams({
    ws: String(rule.workspaceId),
    level: levelsOf(rule).join(","),
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  });
  if (rule.application) params.set("application", rule.application);
  if (rule.service) params.set("service", rule.service);
  if (rule.environment) params.set("environment", rule.environment);
  if (fingerprint) params.set("fingerprint", fingerprint);
  // Directo a /logs: la portada redirige sin conservar la query.
  return `${config.publicDashboardUrl}/logs?${params.toString()}`;
};

/**
 * Desde cuándo busca grupos nuevos una regla de error nuevo. Normalmente es
 * su ventana, pero si el cooldown acaba de terminar se remonta al último
 * aviso: lo que apareció mientras la regla callaba ya ha salido de la ventana
 * y, si no, nunca se avisaría. No se repite nada: lo avisado entonces tenía su
 * primera aparición antes de `lastTriggeredAt`.
 */
export const newGroupWindowStart = (rule: AlertRule, now: Date): Date => {
  const windowStart = now.getTime() - rule.windowMinutes * MINUTE_MS;
  const last = rule.lastTriggeredAt?.getTime();
  // Si el cooldown acabó antes de la ventana, las pasadas posteriores ya
  // vieron lo que surgió durante él.
  if (last === undefined || last + rule.cooldownMinutes * MINUTE_MS < windowStart) return new Date(windowStart);
  return new Date(Math.min(windowStart, last));
};

/** Evalúa una regla de umbral: N o más coincidencias en la ventana. */
const evaluateThreshold = async (rule: AlertRule, from: Date, to: Date) => {
  const where = ruleWhere(rule, from, to);
  const count = await prisma.log.count({ where });
  if (count < rule.threshold) return null;

  const samples = await prisma.log.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: MAX_SAMPLES,
  });
  // Un umbral cuenta logs de cualquier fallo: el enlace no se acota a una huella.
  return { count, samples: samples.map(toSample), fingerprint: null };
};

/**
 * Evalúa una regla de error nuevo: huellas cuya **primera** aparición cae
 * dentro de la ventana. Es la diferencia entre "esto falla mucho" y "esto no
 * fallaba antes", que suele ser la señal más accionable tras un despliegue.
 */
const evaluateNewErrorGroup = async (rule: AlertRule, from: Date, to: Date) => {
  const condiciones: Prisma.Sql[] = [
    Prisma.sql`"workspaceId" = ${rule.workspaceId}`,
    Prisma.sql`"fingerprint" IS NOT NULL`,
    // Sin límite inferior (la primera aparición puede ser antigua), pero sí
    // superior: un log con fecha futura no cuenta hasta que llegue su hora.
    Prisma.sql`"timestamp" <= ${to}`,
  ];
  if (rule.application) condiciones.push(Prisma.sql`"application" = ${rule.application}`);
  if (rule.service) condiciones.push(Prisma.sql`"service" = ${rule.service}`);
  if (rule.environment) condiciones.push(Prisma.sql`"environment" = ${rule.environment}::"Environment"`);
  condiciones.push(
    Prisma.sql`"level" IN (${Prisma.join(levelsOf(rule).map((nivel) => Prisma.sql`${nivel}::"LogLevel"`))})`,
  );

  // HAVING MIN(timestamp) >= from: el grupo entero es nuevo, no basta con que
  // tenga alguna ocurrencia reciente. COUNT(*) OVER () cuenta todos los grupos
  // nuevos aunque solo se traigan unos pocos de muestra; con el LIMIT 50 de
  // antes, una regla con umbral mayor de 50 no podía dispararse nunca.
  const nuevos = await prisma.$queryRaw<Array<{ fingerprint: string; lastLogId: number; total: number }>>`
    SELECT "fingerprint", MAX("id")::int AS "lastLogId", (COUNT(*) OVER ())::int AS "total"
    FROM "Log"
    WHERE ${Prisma.join(condiciones, " AND ")}
    GROUP BY "fingerprint"
    HAVING MIN("timestamp") >= ${from}
    ORDER BY MAX("timestamp") DESC
    LIMIT ${MAX_SAMPLES}
  `;

  const count = Number(nuevos[0]?.total ?? 0);
  if (count === 0 || count < rule.threshold) return null;

  const samples = await prisma.log.findMany({
    where: { id: { in: nuevos.map((fila) => Number(fila.lastLogId)) } },
    orderBy: { timestamp: "desc" },
  });
  return { count, samples: samples.map(toSample), fingerprint: count === 1 ? nuevos[0].fingerprint : null };
};

type RuleWithChannels = AlertRule & { channels: AlertChannel[] };

/** Comprueba una regla y, si procede, avisa. Devuelve true si se disparó. */
export const evaluateRule = async (rule: RuleWithChannels, now = new Date()): Promise<boolean> => {
  // Cooldown: tras avisar, la regla calla un rato. Sin esto, un incidente que
  // dura una hora generaría sesenta avisos idénticos.
  if (rule.lastTriggeredAt && now.getTime() - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * MINUTE_MS) {
    return false;
  }

  const from =
    rule.type === "new_error_group"
      ? newGroupWindowStart(rule, now)
      : new Date(now.getTime() - rule.windowMinutes * MINUTE_MS);
  const resultado =
    rule.type === "new_error_group"
      ? await evaluateNewErrorGroup(rule, from, now)
      : await evaluateThreshold(rule, from, now);

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
    dashboardUrl: dashboardLink(rule, { from, to: now }, resultado.fingerprint),
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
        fingerprint: null,
        traceId: null,
      },
    ],
    dashboardUrl: config.publicDashboardUrl || null,
  };

  const [delivery] = await deliverToChannels([channel], payload);
  return delivery;
};
