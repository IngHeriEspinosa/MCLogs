/**
 * Actualizacion automatica de las vistas con rango relativo ("ultimas 24 h").
 *
 * El valor se guarda como texto en las preferencias del navegador: los
 * segundos entre refrescos, o "off". Un valor guardado que ya no se reconoce
 * (una version anterior, una edicion a mano) vuelve al de por defecto.
 */
export const REFRESH_SETTINGS = ["off", "15", "30", "60", "300"] as const;

export type RefreshSetting = (typeof REFRESH_SETTINGS)[number];

/** Un minuto: lo que hacian las vistas antes de que fuera configurable. */
export const DEFAULT_REFRESH: RefreshSetting = "60";

export const isRefreshSetting = (value: unknown): value is RefreshSetting =>
  typeof value === "string" && (REFRESH_SETTINGS as readonly string[]).includes(value);

/** Milisegundos entre refrescos, o null si esta apagada. */
export const refreshIntervalMs = (value: unknown): number | null => {
  const setting = isRefreshSetting(value) ? value : DEFAULT_REFRESH;
  return setting === "off" ? null : Number(setting) * 1000;
};
