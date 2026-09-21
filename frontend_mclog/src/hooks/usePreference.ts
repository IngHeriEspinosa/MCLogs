"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Preferencia de interfaz guardada en localStorage (resumen plegado, menu
 * contraido, densidad de la tabla...).
 *
 * El primer render usa siempre el valor por defecto, igual que el servidor, y
 * el guardado se aplica tras montar: asi no hay desajustes de hidratacion. Si
 * el almacenamiento no esta disponible (modo privado, cuota), la preferencia
 * simplemente no persiste.
 */
export function usePreference<T extends string | boolean>(key: string, fallback: T) {
  const storageKey = `mclog.${key}`;
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Sin almacenamiento: se queda el valor por defecto.
    }
  }, [storageKey]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignorado a proposito: es una comodidad, no un dato.
      }
    },
    [storageKey],
  );

  return [value, update] as const;
}

/** true mientras la media query se cumple. En el servidor, siempre false. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
