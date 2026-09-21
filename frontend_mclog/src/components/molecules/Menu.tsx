"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { Button, ButtonSize, ButtonVariant, IconButton } from "@/components/atoms/Button";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Portal } from "@/components/molecules/Portal";
import { useDismiss, useFloating } from "@/hooks/useFloating";

export type MenuEntry =
  | {
      type?: "item";
      key: string;
      label: string;
      hint?: string;
      icon?: IconName;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      /** Marca de seleccion (menus de preferencia: tema, idioma). */
      checked?: boolean;
    }
  | { type: "label"; key: string; label: string }
  | { type: "separator"; key: string };

type MenuProps = {
  items: MenuEntry[];
  /** Texto del disparador; con `iconOnly` pasa a ser su nombre accesible. */
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: "start" | "end";
  /** Contenido propio del disparador (p. ej. un avatar). */
  trigger?: React.ReactNode;
  triggerClassName?: string;
  /** Cabecera fija del panel, encima de las opciones. */
  header?: React.ReactNode;
};

/** Menu de acciones con el patron de teclado de ARIA (flechas, Inicio/Fin, Esc). */
export const Menu: React.FC<MenuProps> = ({
  items,
  label,
  icon,
  iconOnly,
  variant = "secondary",
  size = "md",
  align = "end",
  trigger,
  triggerClassName = "",
  header,
}) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { anchorRef, floatingRef, style } = useFloating<HTMLButtonElement, HTMLDivElement>(open, { align });

  const enabledIndexes = items
    .map((item, index) => ((item.type ?? "item") === "item" && !("disabled" in item && item.disabled) ? index : -1))
    .filter((index) => index >= 0);

  const focusItem = (index: number) => itemRefs.current[index]?.focus();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) anchorRef.current?.focus();
  };

  useDismiss(open, () => setOpen(false), [anchorRef, floatingRef]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => focusItem(enabledIndexes[0]));
    return () => cancelAnimationFrame(frame);
    // Solo al abrir: enfocar el primero en cada render robaria el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const current = itemRefs.current.findIndex((element) => element === document.activeElement);
    const position = enabledIndexes.indexOf(current);
    const move = (to: number) => {
      event.preventDefault();
      focusItem(enabledIndexes[(to + enabledIndexes.length) % enabledIndexes.length]);
    };
    if (event.key === "ArrowDown") move(position + 1);
    else if (event.key === "ArrowUp") move(position - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(enabledIndexes.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") close(false);
  };

  const triggerProps = {
    ref: anchorRef,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((value) => !value),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <>
      {trigger ? (
        <button type="button" aria-label={label} className={triggerClassName} {...triggerProps}>
          {trigger}
        </button>
      ) : iconOnly && icon ? (
        <IconButton icon={icon} label={label} variant={variant} size={size} active={open} className={triggerClassName} {...triggerProps} />
      ) : (
        <Button variant={variant} size={size} icon={icon} iconRight="chevronDown" className={triggerClassName} {...triggerProps}>
          {label}
        </Button>
      )}

      {open && (
        <Portal anchorRef={anchorRef}>
          <div
            ref={floatingRef}
            style={style}
            className="min-w-[14rem] max-w-[calc(100vw-16px)] animate-pop-in overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop"
          >
            {header}
            <div id={menuId} role="menu" aria-label={label} onKeyDown={onKeyDown}>
              {items.map((item, index) => {
                if (item.type === "separator") return <div key={item.key} role="separator" className="my-1 h-px bg-line" />;
                if (item.type === "label") {
                  return (
                    <div key={item.key} role="presentation" className="eyebrow px-2.5 pb-1 pt-2">
                      {item.label}
                    </div>
                  );
                }
                return (
                  <button
                    key={item.key}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={item.checked}
                    tabIndex={-1}
                    disabled={item.disabled}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none disabled:opacity-50 ${
                      item.danger ? "text-danger" : "text-ink"
                    }`}
                  >
                    {item.icon && <Icon name={item.icon} className={`h-4 w-4 ${item.danger ? "" : "text-ink-3"}`} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.hint && <span className="block truncate text-xs text-ink-3">{item.hint}</span>}
                    </span>
                    {item.checked && <Icon name="check" className="h-4 w-4 text-brand" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
};
