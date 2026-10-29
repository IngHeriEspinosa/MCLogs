"use client";
import { DEFAULT_REFRESH, isRefreshSetting, refreshIntervalMs, RefreshSetting } from "@/common/time/refresh";
import { usePreference } from "@/hooks/usePreference";

/**
 * Cada cuanto se refrescan solas las vistas con rango relativo. Lo elige el
 * usuario en la barra superior y se recuerda en este navegador.
 */
export const useAutoRefresh = () => {
  const [stored, setStored] = usePreference<string>("autoRefresh", DEFAULT_REFRESH);
  const setting: RefreshSetting = isRefreshSetting(stored) ? stored : DEFAULT_REFRESH;
  return { setting, intervalMs: refreshIntervalMs(setting), setSetting: (next: RefreshSetting) => setStored(next) };
};
