"use client";
import { useCallback, useEffect, useState } from "react";

const isRootFullscreen = () => document.fullscreenElement === document.documentElement;

/**
 * Modo presentacion: la vista ocupa toda la pantalla, sin barra lateral ni
 * barra superior, para proyectarla en una reunion o dejarla fija en un
 * monitor de guardia.
 *
 * La pantalla completa se pide sobre <html> y no sobre la vista: los menus,
 * dialogos y avisos se montan en un portal en <body> y asi siguen apareciendo
 * encima. Si el navegador no la concede (Safari en iPhone, un iframe sin
 * permiso), el modo vale igual: se oculta el cromo aunque siga el del navegador.
 *
 * El estado sigue al del navegador: salir con Esc o desde su propio aviso
 * tambien sale del modo. Y cada pagina monta su propio layout, asi que una
 * vista que se abre con la pantalla completa ya puesta (un enlace a la traza
 * desde los logs) arranca presentando en lugar de mostrar el cromo encima.
 */
export function usePresentationMode(enabled: boolean) {
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (isRootFullscreen()) setPresenting(true);
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [enabled]);

  // Sin await antes de requestFullscreen: el navegador solo la concede dentro
  // del gesto del usuario que la pide.
  const enter = useCallback(() => {
    setPresenting(true);
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
      // Denegada: se queda el modo sin cromo, que es lo que mas importa.
    });
  }, []);

  const exit = useCallback(() => {
    setPresenting(false);
    if (!isRootFullscreen()) return;
    document.exitFullscreen().catch(() => {
      // Ya habia salido (Esc casi a la vez): no queda nada que deshacer.
    });
  }, []);

  return { presenting: enabled && presenting, enter, exit };
}
