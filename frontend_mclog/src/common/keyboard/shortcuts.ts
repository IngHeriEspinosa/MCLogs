/**
 * Atajos globales del panel, al estilo de las consolas conocidas: "g" y una
 * letra lleva a una seccion; "?" abre la ayuda con todos los atajos.
 *
 * La resolucion es pura (sin DOM) para poder probarla: recibe la tecla, desde
 * cuando hay una "g" pendiente y el instante actual.
 */

/** Tiempo que espera la segunda tecla despues de "g". */
export const CHORD_TIMEOUT_MS = 1500;

/** Destino de cada "g + letra". */
export const GO_TO = {
  l: "/logs",
  e: "/errors",
  t: "/traces",
  r: "/reports",
  a: "/settings/alerts",
} as const;

export type GoToKey = keyof typeof GO_TO;

export type ShortcutAction = { type: "navigate"; href: string } | { type: "pending" } | { type: "help" } | null;

const isGoToKey = (key: string): key is GoToKey => Object.prototype.hasOwnProperty.call(GO_TO, key);

export const resolveShortcut = (key: string, pendingSince: number | null, now: number): ShortcutAction => {
  const lower = key.toLowerCase();
  if (pendingSince !== null && now - pendingSince <= CHORD_TIMEOUT_MS) {
    // Tras la "g", una tecla que no es destino cancela el atajo sin hacer nada.
    return isGoToKey(lower) ? { type: "navigate", href: GO_TO[lower] } : null;
  }
  if (lower === "g") return { type: "pending" };
  if (key === "?") return { type: "help" };
  return null;
};

/** "g l" para el aria-keyshortcuts del enlace a esa seccion, si tiene atajo. */
export const shortcutFor = (href: string): string | undefined => {
  const entry = Object.entries(GO_TO).find(([, target]) => target === href);
  return entry ? `g ${entry[0]}` : undefined;
};
