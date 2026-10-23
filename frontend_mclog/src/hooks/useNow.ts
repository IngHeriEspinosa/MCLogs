"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Instante de referencia de los rangos relativos ("ultimas 24 h").
 *
 * Se fija al montar y al cambiar `resetKey` (el rango), no en cada render,
 * para que las consultas sean estables. Con `ticking`, avanza cada
 * `intervalMs` mientras la pestaña esta visible, y al volver a ella: asi la
 * tabla y el resumen miran siempre la misma ventana y se mueven juntos. Antes
 * el resumen se refrescaba con el `from` del primer render y la ventana de
 * "24 h" se alargaba un minuto en cada refresco.
 */
export const useNow = (intervalMs: number, ticking: boolean, resetKey: string) => {
  const [now, setNow] = useState(() => Date.now());

  // Solo al cambiar la clave, no al montar: el estado inicial ya trae un
  // instante valido, y recalcularlo unos milisegundos despues cambiaba `from`,
  // con lo que todas las consultas de la pagina salian dos veces.
  const lastKey = useRef(resetKey);
  useEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    setNow(Date.now());
  }, [resetKey]);

  useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ticking, intervalMs]);

  return [now, setNow] as const;
};
