"use client";
import { CSSProperties, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/useElementSize";

type FloatingOptions = {
  /** "center" centra el panel sobre el ancla (tooltips). */
  align?: "start" | "center" | "end";
  /** Separacion con el ancla, en px. */
  offset?: number;
  /** El panel mide al menos lo que su ancla (selects). */
  matchWidth?: boolean;
};

const VIEWPORT_MARGIN = 8;
const MIN_HEIGHT = 140;

/**
 * Posiciona un panel flotante (lista, menu, calendario) junto a su ancla.
 *
 * Usa `position: fixed` con coordenadas de la ventana en lugar de colgarlo
 * del ancla: asi no lo recorta ningun contenedor con `overflow: hidden`, como
 * una tabla con scroll horizontal. Si abajo no cabe y arriba hay mas sitio,
 * se abre hacia arriba; y nunca se sale por los lados.
 */
export function useFloating<A extends HTMLElement = HTMLButtonElement, F extends HTMLElement = HTMLDivElement>(
  open: boolean,
  { align = "start", offset = 6, matchWidth = false }: FloatingOptions = {},
) {
  const anchorRef = useRef<A>(null);
  const floatingRef = useRef<F>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, visibility: "hidden" });

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const below = viewportHeight - rect.bottom - offset - VIEWPORT_MARGIN;
    const above = rect.top - offset - VIEWPORT_MARGIN;

    const height = floating.offsetHeight;
    const width = floating.offsetWidth;
    const placeAbove = height > below && above > below;
    const available = Math.max(MIN_HEIGHT, placeAbove ? above : below);

    let left = align === "end" ? rect.right - width : align === "center" ? rect.left + (rect.width - width) / 2 : rect.left;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - width - VIEWPORT_MARGIN));
    const top = placeAbove ? rect.top - offset - Math.min(height, available) : rect.bottom + offset;

    setStyle({
      position: "fixed",
      top: Math.max(VIEWPORT_MARGIN, top),
      left,
      minWidth: matchWidth ? rect.width : undefined,
      maxHeight: available,
      visibility: "visible",
      zIndex: 70,
    });
  }, [align, offset, matchWidth]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setStyle((current) => ({ ...current, visibility: "hidden" }));
      return;
    }
    update();

    const onScroll = (event: Event) => {
      // El scroll dentro del propio panel (una lista larga) no lo mueve.
      if (floatingRef.current && event.target instanceof Node && floatingRef.current.contains(event.target)) return;
      update();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(() => update());
    if (floatingRef.current) observer.observe(floatingRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [open, update]);

  return { anchorRef, floatingRef, style, update };
}

/**
 * Cierra un panel al pulsar fuera de el (y de su ancla). Se escucha en fase de
 * captura para enterarse aunque el clic caiga en algo que detiene la
 * propagacion.
 */
export function useDismiss(open: boolean, onDismiss: () => void, refs: Array<RefObject<HTMLElement>>) {
  const latest = useRef({ onDismiss, refs });
  latest.current = { onDismiss, refs };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (latest.current.refs.some((ref) => ref.current?.contains(target))) return;
      latest.current.onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);
}
