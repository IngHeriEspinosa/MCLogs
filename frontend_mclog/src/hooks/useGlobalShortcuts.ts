"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resolveShortcut } from "@/common/keyboard/shortcuts";

const MODIFIERS = ["Shift", "Control", "Alt", "Meta"];

/**
 * Atajos globales ("g" + letra, "?"). No actuan mientras se escribe, con
 * Ctrl/Cmd/Alt, dentro de un widget que usa las letras (la grafica) ni con un
 * dialogo modal abierto: ahi la tecla es de quien tiene el foco.
 */
export const useGlobalShortcuts = (onHelp: () => void) => {
  const router = useRouter();
  const pendingSince = useRef<number | null>(null);
  // El ultimo onHelp, sin reabrir el listener en cada render; se actualiza en
  // un efecto porque el render no debe escribir refs.
  const latestOnHelp = useRef(onHelp);
  useEffect(() => {
    latestOnHelp.current = onHelp;
  }, [onHelp]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Mayus sola no cuenta: "?" y "G" la necesitan y no deben cancelar la "g".
      if (MODIFIERS.includes(event.key)) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], [role='slider']")) return;
      if (document.querySelector("dialog[open]")) return;

      const now = Date.now();
      const action = resolveShortcut(event.key, pendingSince.current, now);
      pendingSince.current = action?.type === "pending" ? now : null;
      if (!action || action.type === "pending") return;
      event.preventDefault();
      if (action.type === "help") latestOnHelp.current();
      else router.push(action.href);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);
};
