import { config } from "../config/env";
import logger from "../config/logger";
import { schedulerJobDuration } from "../config/metrics";
import { prisma } from "../config/prisma";
import { deleteLogsOlderThanInBatches } from "../services/logService";
import { evaluateRulesExclusively } from "../alerts/evaluator";
import { runDigestsNow } from "../alerts/digest";
import { LOCK_KEYS, withAdvisoryLock } from "./lock";
import { purgeDeletedWorkspaces } from "../services/workspaceService";
import { getSetting } from "../services/settingsService";
import { purgeExpiredSnapshots } from "../services/snapshotService";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RETENTION_INTERVAL_MS = HOUR_MS;
const REFRESH_TOKEN_CLEANUP_INTERVAL_MS = 6 * HOUR_MS;
// Cada minuto: es la resolucion mas fina que tiene sentido para un aviso, y el
// cooldown de cada regla evita que eso se traduzca en ruido.
const ALERTS_INTERVAL_MS = 60 * 1000;
// Los espacios borrados ya no se ven; purgar sus logs puede esperar.
const WORKSPACE_PURGE_INTERVAL_MS = HOUR_MS;
// Un snapshot caducado ya no se sirve (se comprueba al leerlo); borrarlo es solo liberar espacio.
const SNAPSHOT_PURGE_INTERVAL_MS = HOUR_MS;
const DIGESTS_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Trabajos en ejecucion. Una purga sobre una tabla grande puede durar mas que
 * su intervalo; sin este guard, dos pasadas competirian por las mismas filas.
 */
const inFlight = new Set<string>();

/** Ejecuta un trabajo sin solaparlo consigo mismo y sin que un fallo tumbe el proceso. */
const runExclusively = async (name: string, task: () => Promise<unknown>) => {
  if (inFlight.has(name)) {
    logger.warn("Scheduled job skipped: previous run still in progress", { job: name });
    return;
  }
  inFlight.add(name);
  const startedAt = Date.now();
  let outcome: "ok" | "error" = "ok";
  try {
    await task();
  } catch (error) {
    outcome = "error";
    logger.error("Scheduled job failed", { job: name, error: String(error) });
  } finally {
    inFlight.delete(name);
    const durationMs = Date.now() - startedAt;
    schedulerJobDuration.observe({ job: name, outcome }, durationMs / 1000);
    logger.debug("Scheduled job finished", { job: name, durationMs });
  }
};

/** Fecha limite de la retencion: `months` meses naturales antes de `from`. */
export const retentionCutoff = (months: number, from = new Date()) => {
  const cutoff = new Date(from);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
};

/**
 * Purga los logs que superan la ventana de retencion. La ventana la fija la
 * cuenta root en la configuracion, entre tres meses y cinco anos: siempre se
 * borra algo, la tabla no crece sin limite.
 */
export const runRetentionNow = async (): Promise<number> => {
  const retentionMonths = getSetting("retentionMonths");
  const before = retentionCutoff(retentionMonths);
  const deleted = await deleteLogsOlderThanInBatches(before);
  if (deleted > 0) {
    logger.info("Retention purge completed", {
      retentionMonths,
      before: before.toISOString(),
      deleted,
    });
  }
  return deleted;
};

/**
 * Elimina los refresh tokens caducados. Se deja un dia de margen sobre la
 * expiracion para no borrar filas que aun sirven para diagnosticar una sesion
 * recien caida.
 */
export const runRefreshTokenCleanupNow = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - DAY_MS);
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  if (count > 0) logger.info("Expired refresh tokens removed", { deleted: count });
  return count;
};

let timers: NodeJS.Timeout[] = [];

/**
 * Arranca el mantenimiento periodico.
 *
 * Los temporizadores llevan `unref()` para que no impidan que el proceso
 * termine durante un apagado ordenado. Con varias instancias detras de un
 * balanceador conviene dejar `SCHEDULER_ENABLED=1` solo en una.
 */
export const startScheduler = () => {
  if (!config.schedulerEnabled) {
    logger.info("Scheduler disabled (SCHEDULER_ENABLED=0)");
    return;
  }
  if (timers.length > 0) return;

  const schedule = (name: string, intervalMs: number, task: () => Promise<unknown>) => {
    const timer = setInterval(() => void runExclusively(name, task), intervalMs);
    timer.unref();
    timers.push(timer);
  };

  schedule("retention", RETENTION_INTERVAL_MS, runRetentionNow);
  schedule("refreshTokenCleanup", REFRESH_TOKEN_CLEANUP_INTERVAL_MS, runRefreshTokenCleanupNow);
  // Con las alertas apagadas desde la configuracion, la pasada no evalua nada.
  // Con varias instancias, solo una evalua cada pasada (cerrojo de PostgreSQL).
  schedule("alerts", ALERTS_INTERVAL_MS, async () => (getSetting("alertsEnabled") ? evaluateRulesExclusively() : 0));
  // Cada pocos minutos: cada resumen sale en la primera pasada de su hora.
  schedule("digests", DIGESTS_INTERVAL_MS, () => withAdvisoryLock(LOCK_KEYS.digests, () => runDigestsNow(), 0));
  schedule("workspacePurge", WORKSPACE_PURGE_INTERVAL_MS, purgeDeletedWorkspaces);
  schedule("snapshotPurge", SNAPSHOT_PURGE_INTERVAL_MS, purgeExpiredSnapshots);

  logger.info("Scheduler started", { retentionMonths: getSetting("retentionMonths") });

  // Primera pasada nada mas arrancar: si el servicio estuvo caido, no conviene
  // esperar una hora mas para recuperar el mantenimiento pendiente.
  void runExclusively("refreshTokenCleanup", runRefreshTokenCleanupNow);
  void runExclusively("workspacePurge", purgeDeletedWorkspaces);
  void runExclusively("snapshotPurge", purgeExpiredSnapshots);
  void runExclusively("retention", runRetentionNow);
};

export const stopScheduler = () => {
  timers.forEach(clearInterval);
  timers = [];
};
