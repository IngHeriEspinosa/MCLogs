import client from "@/common/api/client";
import { LAB_APPLICATIONS, LAB_PREFIX, LabLog, LabPlan } from "./scenarios";

/** Muy por debajo del MAX_BATCH_SIZE del backend (500 por defecto). */
const BATCH_SIZE = 100;

export type LabProgress = { sent: number; total: number };

/** Espera que se corta en cuanto se detiene el escenario. */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const isAbort = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { code?: string })?.code === "ERR_CANCELED";

/**
 * Envia un escenario a la API real con la sesion del usuario (la ingesta
 * acepta el JWT igual que una API key de ingest). En lote va en trozos; en
 * vivo, de uno en uno con una pausa, para que el stream los muestre llegando.
 *
 * Devuelve cuantos se enviaron. Si se detiene a medias no es un error: lo
 * enviado ya esta dentro y la cuenta lo refleja.
 */
export const sendPlan = async (
  plan: LabPlan,
  onProgress: (progress: LabProgress) => void,
  signal: AbortSignal,
): Promise<{ sent: number; stopped: boolean }> => {
  const total = plan.logs.length;
  let sent = 0;
  onProgress({ sent, total });

  try {
    if (plan.mode === "batch") {
      for (let index = 0; index < total && !signal.aborted; index += BATCH_SIZE) {
        const chunk = plan.logs.slice(index, index + BATCH_SIZE);
        await client.post("/api/logs/batch", { logs: chunk }, { signal });
        sent += chunk.length;
        onProgress({ sent, total });
      }
    } else {
      for (const log of plan.logs) {
        if (signal.aborted) break;
        await client.post("/api/log", log, { signal });
        sent += 1;
        onProgress({ sent, total });
        if (sent < total) await wait(plan.intervalMs ?? 750, signal);
      }
    }
  } catch (error) {
    if (!isAbort(error)) throw error;
  }

  return { sent, stopped: sent < total };
};

/** Envia un solo log (el compositor a medida) y devuelve el registro creado. */
export const sendLog = async (log: LabLog) => (await client.post<{ id: number }>("/api/log", log)).data;

/**
 * Borra los logs del lab. La purga del backend filtra por nombre exacto de
 * aplicacion, asi que se recorre la lista conocida mas cualquier `lab-*` que
 * aparezca en el inventario (p. ej. creada desde el compositor).
 */
export const purgeLab = async (inventory: string[]): Promise<number> => {
  const applications = Array.from(
    new Set([...LAB_APPLICATIONS, ...inventory.filter((name) => name.startsWith(LAB_PREFIX))]),
  );
  // "Antes de mañana": todo lo que haya, incluidos logs con la hora adelantada.
  const before = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const results = await Promise.all(
    applications.map((application) =>
      client.delete<{ deleted: number }>("/api/logs", { params: { before, application } }).then((response) => response.data.deleted),
    ),
  );
  return results.reduce((sum, count) => sum + count, 0);
};
