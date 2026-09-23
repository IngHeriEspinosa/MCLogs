import { config } from "../config/env";
import logger from "../config/logger";
import { prisma } from "../config/prisma";
import { deleteLogsOlderThanInBatches } from "../services/logService";
import { evaluateRules } from "../alerts/evaluator";
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
  try {
    await task();
  } catch (error) {
    logger.error("Scheduled job failed", { job: name, error: String(error) });
  } finally {
    inFlight.delete(name);
    logger.debug("Scheduled job finished", { job: name, durationMs: Date.now() - startedAt });
  }
};

/**
 * Purga los logs que superan la ventana de retencion.
 * Con `RETENTION_DAYS=0` no borra nada: la tabla crece sin limite, que es el
 * comportamiento historico y hay que elegirlo a conciencia.
 */
export const runRetentionNow = async (): Promise<number> => {
  const retentionDays = getSetting("retentionDays");
  if (retentionDays <= 0) return 0;
  const before = new Date(Date.now() - retentionDays * DAY_MS);
  const deleted = await deleteLogsOlderThanInBatches(before);
  if (deleted > 0) {
    logger.info("Retention purge completed", {
      retentionDays,
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
  schedule("alerts", ALERTS_INTERVAL_MS, async () => (getSetting("alertsEnabled") ? evaluateRules() : 0));
  schedule("workspacePurge", WORKSPACE_PURGE_INTERVAL_MS, purgeDeletedWorkspaces);
  schedule("snapshotPurge", SNAPSHOT_PURGE_INTERVAL_MS, purgeExpiredSnapshots);

  logger.info("Scheduler started", {
    retentionDays: getSetting("retentionDays"),
    retentionEnabled: getSetting("retentionDays") > 0,
  });

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
