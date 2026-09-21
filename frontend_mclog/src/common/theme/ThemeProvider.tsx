"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ResolvedTheme, THEME_COOKIE, ThemePreference, writePreferenceCookie } from "./config";

type ThemeValue = {
  /** Lo que eligio el usuario, incluido "system". */
  preference: ThemePreference;
  /** Lo que se esta pintando. Solo se conoce en el navegador. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

const resolve = (preference: ThemePreference): ResolvedTheme => {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
};

/** Aplica el tema sin que cada borde y fondo se anime por separado. */
const apply = (theme: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  // Dos frames: el primero aplica los estilos nuevos, el segundo ya puede
  // devolver las transiciones sin que se vean.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
};

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  // En el servidor no hay forma de saberlo; el script de <head> ya lo resolvio
  // y aqui solo se lee al montar.
  const [resolved, setResolved] = useState<ResolvedTheme>(initialPreference === "dark" ? "dark" : "light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setResolved(current === "dark" ? "dark" : "light");
  }, []);

  // Con "system", seguir los cambios del sistema operativo en caliente.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = media.matches ? "dark" : "light";
      apply(next);
      setResolved(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writePreferenceCookie(THEME_COOKIE, next);
    const theme = resolve(next);
    apply(theme);
    setResolved(theme);
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
};
