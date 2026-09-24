import type { ErrorGroup } from "@/hooks/useErrors";

/** Lo que muestran las tarjetas de Errores, calculado sobre los grupos de la lista. */
export type GroupsSummary = {
  /** Suma de las ocurrencias de todos los grupos. */
  occurrences: number;
  /** El grupo mas grande, para escalar las barras. Nunca menos de 1. */
  max: number;
  /** La aplicacion con mas ocurrencias y cuantas suma, o null si no hay grupos. */
  topApp: { application: string; count: number } | null;
  /** Parte de las ocurrencias que se lleva el grupo mas frecuente (0–1). */
  topShare: number;
};

export const summarizeGroups = (groups: Pick<ErrorGroup, "application" | "count">[]): GroupsSummary => {
  const occurrences = groups.reduce((sum, group) => sum + group.count, 0);
  const byApp = new Map<string, number>();
  groups.forEach((group) => byApp.set(group.application, (byApp.get(group.application) ?? 0) + group.count));
  const top = [...byApp.entries()].sort((a, b) => b[1] - a[1])[0];
  const largest = Math.max(0, ...groups.map((group) => group.count));
  return {
    occurrences,
    max: Math.max(1, largest),
    topApp: top ? { application: top[0], count: top[1] } : null,
    topShare: occurrences ? largest / occurrences : 0,
  };
};
