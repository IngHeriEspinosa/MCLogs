import { Prisma } from "@prisma/client";
import type { AlertChannel, AlertRule, AlertRuleType, Log } from "@prisma/client";
import { config } from "../config/env";
import logger from "../config/logger";
import { alertEvaluations } from "../config/metrics";
import { prisma } from "../config/prisma";
import { deliverToChannels } from "./notifiers";
import { LOCK_KEYS, withAdvisoryLock } from "../jobs/lock";
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

/** Resultado de comprobar una regla: si se cumple, con que cifras y que muestras. */
type Evaluation = {
  triggered: boolean;
  count: number;
  samples: AlertSample[];
  /** Huella del aviso si es de un único fallo, para acotar el enlace. */
  fingerprint: string | null;
  /** Una línea que explica la condición, para los canales. */
  summary: string;
};

const notTriggered = (summary = ""): Evaluation => ({ triggered: false, count: 0, samples: [], fingerprint: null, summary });

const latestSamples = async (where: Prisma.LogWhereInput) =>
  (await prisma.log.findMany({ where, orderBy: { timestamp: "desc" }, take: MAX_SAMPLES })).map(toSample);

/** Regla de umbral: N o más coincidencias en la ventana. */
const evaluateThreshold = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
  const where = ruleWhere(rule, from, to);
  const count = await prisma.log.count({ where });
  const summary = `${count} ${count === 1 ? "coincidencia" : "coincidencias"} en ${rule.windowMinutes} min (umbral ${rule.threshold})`;
  if (count < rule.threshold) return { ...notTriggered(summary), count };
  // Un umbral cuenta logs de cualquier fallo: el enlace no se acota a una huella.
  return { triggered: true, count, samples: await latestSamples(where), fingerprint: null, summary };
};

/**
 * Regla de error nuevo: huellas cuya **primera** aparición cae dentro de la
 * ventana. Es la diferencia entre "esto falla mucho" y "esto no fallaba
 * antes", que suele ser la señal más accionable tras un despliegue.
 *
 * Solo mira las huellas con algún log en la ventana (por el índice de fecha) y,
 * de esas, comprueba su primera vez por el índice de huella. Antes agregaba
 * todo lo retenido en cada pasada de cada regla.
 */
const evaluateNewErrorGroup = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
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
  const where = Prisma.join(condiciones, " AND ");

  // HAVING MIN(timestamp) >= from: el grupo entero es nuevo, no basta con que
  // tenga alguna ocurrencia reciente. COUNT(*) OVER () cuenta todos los grupos
  // nuevos aunque solo se traigan unos pocos de muestra.
  const nuevos = await prisma.$queryRaw<Array<{ fingerprint: string; lastLogId: number; total: number }>>`
    SELECT "fingerprint", MAX("id")::int AS "lastLogId", (COUNT(*) OVER ())::int AS "total"
    FROM "Log"
    WHERE ${where}
      AND "fingerprint" IN (
        SELECT DISTINCT "fingerprint" FROM "Log"
        WHERE ${where} AND "timestamp" >= ${from}
      )
    GROUP BY "fingerprint"
    HAVING MIN("timestamp") >= ${from}
    ORDER BY MAX("timestamp") DESC
    LIMIT ${MAX_SAMPLES}
  `;

  const count = Number(nuevos[0]?.total ?? 0);
  const summary = `${count} ${count === 1 ? "fallo nuevo" : "fallos nuevos"} en ${rule.windowMinutes} min`;
  if (count === 0 || count < rule.threshold) return { ...notTriggered(summary), count };

  const samples = await prisma.log.findMany({
    where: { id: { in: nuevos.map((fila) => Number(fila.lastLogId)) } },
    orderBy: { timestamp: "desc" },
  });
  return { triggered: true, count, samples: samples.map(toSample), fingerprint: count === 1 ? nuevos[0].fingerprint : null, summary };
};

/**
 * Regla de regresión: fallos resueltos que han vuelto a aparecer en la
 * ventana. Lee ErrorGroup, que la ingesta reactiva al llegar una ocurrencia
 * posterior a la resolución. Con entorno, el fallo tiene que haber vuelto en él.
 */
const evaluateRegression = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
  const groups = await prisma.errorGroup.findMany({
    where: {
      workspaceId: rule.workspaceId,
      lastRegressedAt: { gte: from, lte: to },
      level: { in: levelsOf(rule) as never[] },
      ...(rule.application ? { application: rule.application } : {}),
      ...(rule.service ? { service: rule.service } : {}),
    },
    orderBy: { lastRegressedAt: "desc" },
    select: { fingerprint: true },
  });
  let fingerprints = groups.map((group) => group.fingerprint);
  if (rule.environment && fingerprints.length > 0) {
    const inEnvironment = await prisma.log.groupBy({
      by: ["fingerprint"],
      where: { workspaceId: rule.workspaceId, environment: rule.environment, fingerprint: { in: fingerprints }, timestamp: { gte: from, lte: to } },
    });
    const present = new Set(inEnvironment.map((row) => row.fingerprint));
    fingerprints = fingerprints.filter((fingerprint) => present.has(fingerprint));
  }

  const count = fingerprints.length;
  const summary = `${count} ${count === 1 ? "fallo resuelto ha vuelto" : "fallos resueltos han vuelto"} en ${rule.windowMinutes} min`;
  if (count === 0 || count < rule.threshold) return { ...notTriggered(summary), count };

  const samples = await latestSamples({
    workspaceId: rule.workspaceId,
    fingerprint: { in: fingerprints.slice(0, MAX_SAMPLES) },
    timestamp: { gte: from, lte: to },
    ...(rule.environment ? { environment: rule.environment } : {}),
  });
  return { triggered: true, count, samples, fingerprint: count === 1 ? fingerprints[0] : null, summary };
};

/** Filtro de aplicación, servicio y entorno de una regla, sin nivel ni fechas. */
const scopeWhere = (rule: AlertRule): Prisma.LogWhereInput => ({
  workspaceId: rule.workspaceId,
  ...(rule.application ? { application: rule.application } : {}),
  ...(rule.service ? { service: rule.service } : {}),
  ...(rule.environment ? { environment: rule.environment } : {}),
});

const percent = (value: number) => `${Math.round(value * 10) / 10} %`;

/**
 * Regla de tasa de error: el porcentaje de logs de nivel error en la ventana
 * llega al umbral (en %). Con menos de `minVolume` logs no se evalúa: tres
 * logs con un error son un 33 % que no dice nada.
 */
const evaluateErrorRate = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
  const base: Prisma.LogWhereInput = { ...scopeWhere(rule), timestamp: { gte: from, lte: to } };
  const errorsWhere: Prisma.LogWhereInput = { ...base, level: "error" };
  const [total, errors] = await Promise.all([prisma.log.count({ where: base }), prisma.log.count({ where: errorsWhere })]);
  const rate = total > 0 ? (errors / total) * 100 : 0;
  const summary = `${percent(rate)} de errores (${errors} de ${total}, umbral ${rule.threshold} %)`;
  if (total < rule.minVolume || rate < rule.threshold) return { ...notTriggered(summary), count: errors };
  return { triggered: true, count: errors, samples: await latestSamples(errorsWhere), fingerprint: null, summary };
};

const WEEK_MS = 7 * 24 * 60 * MINUTE_MS;

/**
 * Regla de silencio: ningún log en la ventana de algo que sí emitió en la
 * semana anterior. Es el latido de un script programado (un Scheduled de
 * NetSuite que dejó de correr no falla: simplemente calla).
 */
const evaluateSilence = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
  const scope = scopeWhere(rule);
  const [inWindow, last] = await Promise.all([
    prisma.log.count({ where: { ...scope, timestamp: { gte: from, lte: to } } }),
    prisma.log.findFirst({
      where: { ...scope, timestamp: { gte: new Date(from.getTime() - WEEK_MS), lt: from } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
  ]);
  const summary = last
    ? `Sin logs en ${rule.windowMinutes} min; el último llegó el ${last.timestamp.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : `Sin logs en ${rule.windowMinutes} min`;
  // Sin actividad en la semana anterior no hay latido que echar de menos.
  if (inWindow > 0 || !last) return notTriggered(`${inWindow} logs en ${rule.windowMinutes} min`);
  return { triggered: true, count: 0, samples: [], fingerprint: null, summary };
};

/**
 * Regla de pico: la ventana tiene `threshold` veces o más lo normal, medido
 * como la media de ventanas iguales en los 7 días anteriores. Con menos de
 * `minVolume` coincidencias no se evalúa.
 */
const evaluateSpike = async (rule: AlertRule, from: Date, to: Date): Promise<Evaluation> => {
  const windowMs = to.getTime() - from.getTime();
  const levels = { level: { in: levelsOf(rule) as never[] } };
  const [current, history] = await Promise.all([
    prisma.log.count({ where: ruleWhere(rule, from, to) }),
    prisma.log.count({ where: { ...scopeWhere(rule), ...levels, timestamp: { gte: new Date(from.getTime() - WEEK_MS), lt: from } } }),
  ]);
  const baseline = history / Math.max(1, WEEK_MS / Math.max(windowMs, MINUTE_MS));
  const factor = current / Math.max(baseline, 1);
  const summary = `${current} en ${rule.windowMinutes} min, ${Math.round(factor * 10) / 10}× lo normal (media ${Math.round(baseline * 10) / 10}, umbral ${rule.threshold}×)`;
  if (current < rule.minVolume || factor < rule.threshold) return { ...notTriggered(summary), count: current };
  return { triggered: true, count: current, samples: await latestSamples(ruleWhere(rule, from, to)), fingerprint: null, summary };
};

const EVALUATORS: Record<AlertRuleType, (rule: AlertRule, from: Date, to: Date) => Promise<Evaluation>> = {
  threshold: evaluateThreshold,
  new_error_group: evaluateNewErrorGroup,
  regression: evaluateRegression,
  error_rate: evaluateErrorRate,
  silence: evaluateSilence,
  spike: evaluateSpike,
};

/**
 * Tipos de condición continua: se cumplen durante un tiempo y luego se
 * despejan, y entonces se avisa de la recuperación. Los de evento (fallo
 * nuevo, regresión) solo avisan al ocurrir.
 */
export const CONTINUOUS_RULES: ReadonlySet<AlertRuleType> = new Set<AlertRuleType>(["threshold", "error_rate", "silence", "spike"]);

type RuleWithChannels = AlertRule & { channels: AlertChannel[] };

/**
 * Comprueba una regla y avisa si procede. Devuelve true si se disparó.
 *
 * - Silenciada (`mutedUntil` futuro): ni se evalúa.
 * - Se cumple fuera del cooldown: aviso de disparo y, si es continua, pasa a
 *   `firing`. Dentro del cooldown no se repite: un incidente de una hora
 *   generaría sesenta avisos idénticos.
 * - Deja de cumplirse estando en `firing`: aviso de recuperación y vuelve a `ok`.
 */
export const evaluateRule = async (rule: RuleWithChannels, now = new Date()): Promise<boolean> => {
  if (rule.mutedUntil && rule.mutedUntil > now) return false;

  const continuous = CONTINUOUS_RULES.has(rule.type);
  const inCooldown =
    rule.lastTriggeredAt !== null && now.getTime() - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * MINUTE_MS;
  // Las de evento en cooldown ni se evalúan: la ventana de la siguiente pasada
  // ya se remonta a lo que surgió mientras callaban (newGroupWindowStart).
  if (!continuous && inCooldown) return false;

  const from =
    rule.type === "new_error_group" || rule.type === "regression"
      ? newGroupWindowStart(rule, now)
      : new Date(now.getTime() - rule.windowMinutes * MINUTE_MS);
  const result = await EVALUATORS[rule.type](rule, from, now);

  if (result.triggered) {
    if (inCooldown) return false;
    await notify(rule, "trigger", result, { from, to: now }, now);
    return true;
  }
  if (continuous && rule.state === "firing") await notify(rule, "resolve", result, { from, to: now }, now);
  return false;
};

/** Avisa por los canales activos de la regla y deja el evento y el nuevo estado registrados. */
const notify = async (
  rule: RuleWithChannels,
  kind: "trigger" | "resolve",
  result: Evaluation,
  window: { from: Date; to: Date },
  now: Date,
) => {
  const payload: AlertPayload = {
    rule: { id: rule.id, name: rule.name, type: rule.type },
    kind,
    triggeredAt: now.toISOString(),
    count: result.count,
    windowMinutes: rule.windowMinutes,
    threshold: rule.threshold,
    application: rule.application,
    environment: rule.environment,
    level: rule.level,
    summary: result.summary,
    samples: result.samples,
    dashboardUrl: dashboardLink(rule, window, result.fingerprint),
  };

  const deliveries = await deliverToChannels(
    rule.channels.filter((channel) => channel.enabled),
    payload,
  );

  // El cooldown arranca aunque falle el envío: reintentar cada minuto contra un
  // canal caído solo multiplica el ruido cuando vuelva.
  const state = kind === "trigger" && CONTINUOUS_RULES.has(rule.type) ? "firing" : "ok";
  await prisma.$transaction([
    prisma.alertEvent.create({
      data: {
        ruleId: rule.id,
        triggeredAt: now,
        kind,
        count: result.count,
        sampleLogIds: result.samples.map((sample) => sample.id),
        deliveries: deliveries as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.alertRule.update({
      where: { id: rule.id },
      data: kind === "trigger" ? { lastTriggeredAt: now, state } : { state },
    }),
  ]);

  logger.info(kind === "trigger" ? "Alert triggered" : "Alert resolved", {
    rule: rule.name,
    count: result.count,
    channels: deliveries.length,
    failed: deliveries.filter((entrega) => !entrega.ok).length,
  });
};

/** Evalúa todas las reglas activas. No lanza: un fallo en una no frena las demás. */
export const evaluateRules = async (now = new Date()): Promise<number> => {
  const rules = await prisma.alertRule.findMany({ where: { enabled: true }, include: { channels: true } });
  let disparadas = 0;

  for (const rule of rules) {
    try {
      const triggered = await evaluateRule(rule, now);
      if (triggered) disparadas += 1;
      alertEvaluations.inc({ rule_type: rule.type, outcome: triggered ? "triggered" : "quiet" });
    } catch (error) {
      alertEvaluations.inc({ rule_type: rule.type, outcome: "error" });
      logger.error("Alert rule evaluation failed", { rule: rule.name, error: String(error) });
    }
  }
  return disparadas;
};

/**
 * Como evaluateRules, pero solo en una instancia a la vez (ver withAdvisoryLock):
 * con varias réplicas con el planificador encendido, nadie avisa dos veces.
 */
export const evaluateRulesExclusively = (now = new Date()): Promise<number> =>
  withAdvisoryLock(LOCK_KEYS.alerts, () => evaluateRules(now), 0);

/** Envía un aviso de prueba por un canal, para validarlo al configurarlo. */
export const sendTestAlert = async (channel: AlertChannel) => {
  const payload: AlertPayload = {
    rule: { id: 0, name: "Prueba de configuración", type: "threshold" },
    kind: "trigger",
    triggeredAt: new Date().toISOString(),
    count: 1,
    windowMinutes: 10,
    threshold: 1,
    application: null,
    environment: null,
    level: "error",
    summary: "Aviso de prueba: 1 coincidencia en 10 min (umbral 1)",
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
