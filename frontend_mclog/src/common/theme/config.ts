export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "mclog_theme";

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/**
 * Script que corre en <head> antes de pintar nada.
 *
 * Sin el, quien use el modo oscuro veria un destello blanco en cada carga: el
 * servidor no puede saber que tema tiene el sistema operativo del usuario. Va
 * en linea y sin dependencias por eso mismo, porque tiene que ejecutarse antes
 * que cualquier bundle.
 */
export const themeBootstrapScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var p=m?m[1]:"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

/** Escribe una preferencia de interfaz en cookie durante un ano. */
export const writePreferenceCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
};
