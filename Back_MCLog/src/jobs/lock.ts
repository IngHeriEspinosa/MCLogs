import { prisma } from "../config/prisma";

/**
 * Ejecuta `task` solo si consigue el cerrojo `key` de PostgreSQL; si no, se
 * salta la pasada y devuelve `skipped`. Con varias instancias con el
 * planificador encendido, una sola hace cada trabajo y nadie avisa dos veces.
 * El cerrojo es de transaccion, asi que se suelta solo aunque la instancia
 * muera a medias.
 */
export const withAdvisoryLock = async <T>(key: number, task: () => Promise<T>, skipped: T): Promise<T> =>
  prisma.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${key}) AS "locked"`;
      return row?.locked ? task() : skipped;
    },
    { timeout: 55_000, maxWait: 5_000 },
  );

/** Claves de los cerrojos: enteros fijos y distintos por trabajo. */
export const LOCK_KEYS = { alerts: 4_812_771, digests: 4_812_772 } as const;
