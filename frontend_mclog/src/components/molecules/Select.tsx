"use client";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Portal } from "@/components/molecules/Portal";
import { useDismiss, useFloating } from "@/hooks/useFloating";
import { useI18n } from "@/common/i18n/I18nProvider";

export type SelectOption<V extends string> = {
  value: V;
  label: string;
  hint?: string;
  /** Clase de fondo de un punto de color (niveles, estados). */
  dotClass?: string;
  icon?: IconName;
};

type SelectProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  /** Nombre accesible si no hay un <label> visible asociado (Field). */
  label?: string;
  placeholder?: string;
  /** Icono a la izquierda del valor, en el disparador. */
  icon?: IconName;
  /** Anade un buscador en la lista. */
  searchable?: boolean;
  /** Con buscador: permite usar el texto escrito aunque no sea una opcion. */
  allowCustom?: boolean;
  size?: "sm" | "md";
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
};

/**
 * Select propio con el patron "select-only combobox" de ARIA: el disparador
 * conserva el foco y anuncia la opcion activa con aria-activedescendant, asi
 * que el lector de pantalla lee etiqueta, valor y estado igual que con un
 * <select> nativo, pero con la lista estilada, puntos de color y buscador.
 */
export function Select<V extends string>({
  value,
  onChange,
  options,
  label,
  placeholder,
  icon,
  searchable,
  allowCustom,
  size = "md",
  align = "start",
  disabled,
  className = "",
  id,
  "aria-describedby": describedBy,
}: SelectProps<V>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const { anchorRef, floatingRef, style } = useFloating<HTMLButtonElement, HTMLDivElement>(open, {
    align,
    matchWidth: true,
  });

  const selected = options.find((option) => option.value === value);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    const matches = options.filter(
      (option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
    );
    const exact = options.some((option) => option.value.toLowerCase() === needle);
    if (allowCustom && !exact) {
      matches.push({ value: query.trim() as V, label: t.common.useValue(query.trim()), icon: "plus" });
    }
    return matches;
  }, [options, query, allowCustom, t]);

  const optionId = (index: number) => `${listId}-option-${index}`;

  const show = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const hide = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) anchorRef.current?.focus();
  };

  const commit = (option: SelectOption<V> | undefined) => {
    if (!option) return;
    onChange(option.value);
    hide();
  };

  useDismiss(open, () => setOpen(false), [anchorRef, floatingRef]);

  // Con buscador, el foco pasa al campo de busqueda en cuanto el panel es visible.
  useEffect(() => {
    if (!open || !searchable) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId depende solo de listId, que es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const onListKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) return show();
        setActive((index) => Math.min(visible.length - 1, index + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!open) return show();
        setActive((index) => Math.max(0, index - 1));
        return;
      case "Home":
        if (!open || searchable) return;
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        if (!open || searchable) return;
        event.preventDefault();
        setActive(visible.length - 1);
        return;
      case "Enter":
        event.preventDefault();
        if (!open) return show();
        commit(visible[active]);
        return;
      case " ":
        if (searchable && open) return;
        event.preventDefault();
        if (!open) return show();
        commit(visible[active]);
        return;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        hide();
        return;
      case "Tab":
        // Con buscador el foco esta en el panel: se devuelve al disparador y
        // el propio Tab lo lleva al siguiente control, como si nunca se hubiera ido.
        if (open) hide(Boolean(searchable));
        return;
      default:
        // Busqueda por la primera letra, como en un <select> nativo.
        if (!searchable && open && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          const now = Date.now();
          typeahead.current.text = (now - typeahead.current.at < 600 ? typeahead.current.text : "") + event.key.toLowerCase();
          typeahead.current.at = now;
          const match = visible.findIndex((option) => option.label.toLowerCase().startsWith(typeahead.current.text));
          if (match >= 0) setActive(match);
        }
    }
  };

  const height = size === "sm" ? "h-8 text-[0.8125rem]" : "h-9 text-sm";

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !searchable && visible[active] ? optionId(active) : undefined}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onListKeyDown}
        // El espacio activa los botones al soltarse; se anula aqui porque ya
        // se gestiona al pulsarse.
        onKeyUp={(event) => event.key === " " && event.preventDefault()}
        className={`field-base flex items-center gap-2 px-3 text-left ${height} ${
          open ? "border-brand ring-4 ring-brand/15" : ""
        } ${className}`}
      >
        {icon && <Icon name={icon} className="h-4 w-4 text-ink-3" />}
        {selected?.dotClass && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${selected.dotClass}`} />}
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink-3"}`}>
          {selected?.label ?? (value || placeholder)}
        </span>
        <Icon name="chevronsUpDown" className="h-3.5 w-3.5 text-ink-3" />
      </button>

      {open && (
        <Portal anchorRef={anchorRef}>
          <div
            ref={floatingRef}
            style={style}
            className="flex min-w-[12rem] max-w-[min(26rem,calc(100vw-16px))] animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            {searchable && (
              <div className="border-b border-line p-1.5">
                <div className="relative flex items-center">
                  <Icon name="search" className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-3" />
                  <input
                    ref={searchRef}
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={visible[active] ? optionId(active) : undefined}
                    aria-label={label ?? t.common.search}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onListKeyDown}
                    placeholder={t.common.search}
                    className="h-8 w-full rounded-lg bg-surface-2 pl-8 pr-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand/25"
                  />
                </div>
              </div>
            )}
            <ul id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
              {visible.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={`${option.value}-${index}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseMove={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(option)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      index === active ? "bg-surface-3 text-ink" : "text-ink-2"
                    }`}
                  >
                    {option.dotClass && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${option.dotClass}`} />}
                    {option.icon && <Icon name={option.icon} className="h-4 w-4 text-ink-3" />}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${isSelected ? "font-medium text-ink" : ""}`}>{option.label}</span>
                      {option.hint && <span className="block truncate text-xs text-ink-3">{option.hint}</span>}
                    </span>
                    {isSelected && <Icon name="check" className="h-4 w-4 text-brand" strokeWidth={2.5} />}
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li role="presentation" className="px-2.5 py-6 text-center text-sm text-ink-3">
                  {t.common.noResults}
                </li>
              )}
            </ul>
          </div>
        </Portal>
      )}
    </>
  );
}
