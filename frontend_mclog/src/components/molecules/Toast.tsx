"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/atoms/Icon";
import { useI18n } from "@/common/i18n/I18nProvider";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

const ICONS = { success: "checkCircle", error: "xCircle", info: "info" } as const;
const ICON_COLOR = { success: "text-success", error: "text-danger", info: "text-info" };

/** Lo que dura un aviso en pantalla. Los de error no caducan: se cierran a mano. */
const TOAST_MS = 5000;

/**
 * Un aviso. Se pausa mientras el raton o el foco estan encima (WCAG 2.2.1: el
 * tiempo no debe correr mientras se lee) y se cierra con su boton o con Esc.
 */
const Toast: React.FC<{ toast: ToastItem; onClose: (id: number) => void }> = ({ toast, onClose }) => {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || toast.tone === "error") return;
    const timer = setTimeout(() => onClose(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, toast, onClose]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex max-w-sm animate-pop-in items-center gap-2.5 rounded-xl border border-line bg-surface py-2.5 pl-3.5 pr-2 text-sm text-ink shadow-pop"
    >
      <Icon name={ICONS[toast.tone]} className={`h-4 w-4 shrink-0 ${ICON_COLOR[toast.tone]}`} />
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        // Es lo unico enfocable del aviso: Esc se atiende aqui.
        onKeyDown={(event) => event.key === "Escape" && onClose(toast.id)}
        aria-label={t.common.close}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

/**
 * Avisos breves ("Copiado", "Descargado…"). Se pintan en una pila visible y se
 * anuncian en dos regiones vivas aparte, cortesa para los normales y asertiva
 * para los errores: antes cada aviso llevaba su propio role dentro de otra
 * region viva y algunos lectores lo leian dos veces.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [announced, setAnnounced] = useState<{ polite: string; assertive: string }>({ polite: "", assertive: "" });
  const counter = useRef(0);

  const close = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback((message: string, tone: Tone = "success") => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    setAnnounced((current) => (tone === "error" ? { ...current, assertive: message } : { ...current, polite: message }));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announced.polite}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announced.assertive}
      </div>
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
