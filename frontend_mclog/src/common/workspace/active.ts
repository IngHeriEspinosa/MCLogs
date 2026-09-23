/**
 * Espacio de trabajo activo en esta pestana.
 *
 * Vive fuera de React porque lo leen el cliente HTTP (cabecera
 * `X-Workspace-Id`) y el stream en vivo, que no son componentes. Se recuerda
 * en localStorage para volver al mismo espacio, pero cada pestana puede tener
 * el suyo: por eso va en una cabecera y no en una cookie.
 *
 * Hasta saber cual es (hace falta /auth/me para validar el guardado), las
 * peticiones de datos esperan: asi nunca se piden datos de un espacio que ya
 * no corresponde para tirarlos un instante despues.
 */

const STORAGE_KEY = "mclog.workspace";

const readStored = (): number | null => {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

let activeId: number | null | undefined;
const listeners = new Set<() => void>();

let resolveReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});
let isReady = false;

/** Id guardado de la ultima visita; solo una pista hasta validarlo contra la sesion. */
export const getStoredWorkspaceId = (): number | null => {
  if (typeof window === "undefined") return null;
  if (activeId === undefined) activeId = readStored();
  return activeId;
};

/** Id del espacio activo ya validado, o null si aun no se sabe o no hay ninguno. */
export const getActiveWorkspaceId = (): number | null => (isReady ? (activeId ?? null) : null);

/** Resuelve cuando el espacio activo esta decidido. */
export const whenWorkspaceReady = () => ready;

export const setActiveWorkspaceId = (id: number | null) => {
  const changed = id !== activeId || !isReady;
  activeId = id;
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Sin almacenamiento solo se pierde el recordarlo entre visitas.
  }
  if (!isReady) {
    isReady = true;
    resolveReady();
  }
  if (changed) listeners.forEach((listener) => listener());
};

export const subscribeActiveWorkspace = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
