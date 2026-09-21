"use client";
import React, { useEffect, useId, useRef } from "react";
import { IconButton } from "@/components/atoms/Button";
import { Icon, IconName } from "@/components/atoms/Icon";
import { useI18n } from "@/common/i18n/I18nProvider";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconName;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Impide cerrar con Esc o pulsando fuera (p. ej. un secreto que no se volvera a ver). */
  dismissible?: boolean;
};

const WIDTH = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

/**
 * Dialogo modal sobre <dialog> nativo: el navegador ya atrapa el foco, lo
 * devuelve al cerrar y deja inerte el resto de la pagina.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  dismissible = true,
}) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${WIDTH[size]} rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(4_10_14/0.55)] backdrop:backdrop-blur-[2px] open:animate-pop-in`}
    >
      <div className="flex items-start gap-4 px-6 pb-2 pt-6">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon name={icon} className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-heading text-lg font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-ink-3">
              {description}
            </p>
          )}
        </div>
        {dismissible && <IconButton icon="x" label={t.common.close} size="sm" onClick={onClose} className="-mr-2 -mt-1" />}
      </div>
      {children && <div className="px-6 py-4">{children}</div>}
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-line bg-surface-2 px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  );
};
