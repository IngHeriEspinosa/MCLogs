"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * useLayoutEffect en el navegador y useEffect en el servidor. Los componentes
 * cliente tambien se renderizan en el servidor, donde useLayoutEffect no hace
 * nada y React avisa en cada peticion.
 */
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Tamano real de un elemento, para dibujar graficos en pixeles y no deformar las esquinas. */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
