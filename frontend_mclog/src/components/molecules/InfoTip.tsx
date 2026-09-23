"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/atoms/Icon";
import { Portal } from "@/components/molecules/Portal";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useDismiss, useFloating } from "@/hooks/useFloating";

/** Retardo al entrar: cruzar un formulario con el raton no va encendiendo ayudas. */
const SHOW_DELAY_MS = 150;
/** Retardo al salir: da tiempo a llevar el raton del icono al panel. */
const HIDE_DELAY_MS = 120;

type InfoTipProps = {
  /** La explicacion que aparece en el panel. */
  children: React.ReactNode;
  /** Nombre del campo, para el nombre accesible del boton. */
  label?: string;
  className?: string;
};

/**
 * Icono de informacion junto al nombre de un campo, con su explicacion en un
 * panel flotante.
 *
 * Se abre al pasar el raton, al llegar con el teclado y al pulsarlo, que es lo
 * unico que hay en una pantalla tactil; pulsado se queda abierto hasta pulsar
 * fuera. El panel se puede recorrer con el raton sin que se cierre y Esc lo
 * cierra siempre (WCAG 1.4.13).
 *
 * El texto vive tambien, oculto, junto al boton: el lector de pantalla lo lee
 * como descripcion al llegar al icono, sin esperar a que se abra el panel.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ children, label, className = "" }) => {
  const { t } = useI18n();
  const descriptionId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const { anchorRef, floatingRef, style } = useFloating<HTMLButtonElement, HTMLDivElement>(open, {
    align: "center",
    offset: 8,
  });

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }, []);

  useDismiss(pinned, () => setPinned(false), [anchorRef, floatingRef]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // En captura y cancelando el evento: Esc cierra la ayuda y no, ademas, el
  // dialogo o el panel de detalle en el que este el campo.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);

  // Solo el raton: en tactil el "hover" llega junto al toque y lo abriria y
  // cerraria a la vez.
  const hoverTo = (next: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(next), next ? SHOW_DELAY_MS : HIDE_DELAY_MS);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label ? t.common.infoAbout(label) : t.common.moreInfo}
        aria-describedby={descriptionId}
        aria-expanded={open}
        onClick={() => setPinned((value) => !value)}
        onPointerEnter={hoverTo(true)}
        onPointerLeave={hoverTo(false)}
        onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle transition-colors ${
          open ? "text-brand" : "text-ink-3 hover:text-ink"
        } ${className}`}
      >
        <Icon name="info" className="h-3.5 w-3.5" />
      </button>
      <span id={descriptionId} hidden>
        {children}
      </span>
      {open && (
        <Portal anchorRef={anchorRef}>
          <div
            ref={floatingRef}
            aria-hidden
            style={style}
            onPointerEnter={hoverTo(true)}
            onPointerLeave={hoverTo(false)}
            className="w-max max-w-[min(20rem,calc(100vw-16px))] animate-pop-in overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs leading-relaxed text-ink-2 shadow-pop"
          >
            {children}
          </div>
        </Portal>
      )}
    </>
  );
};
