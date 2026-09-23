import React from "react";
import { InfoTip } from "@/components/molecules/InfoTip";

type CardProps = {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Que muestra la tarjeta: un icono de informacion junto al titulo. */
  info?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** Linea bajo la cabecera: para formularios y listas, no para graficos. */
  divider?: boolean;
  /** Sin relleno interior, para tablas que llegan al borde. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  id?: string;
};

/** Superficie base de la consola: borde fino, esquinas amplias y sombra minima. */
export const Card: React.FC<CardProps> = ({
  title,
  eyebrow,
  description,
  info,
  actions,
  children,
  divider,
  flush,
  className = "",
  bodyClassName = "",
  id,
}) => {
  const hasHeader = title || eyebrow || actions;
  return (
    <section id={id} className={`min-w-0 rounded-2xl border border-line bg-surface shadow-card ${className}`}>
      {hasHeader && (
        <header
          className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 ${
            divider ? "border-b border-line pb-3.5" : "pb-2"
          }`}
        >
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && (
              <h2 className="flex items-center gap-1.5 font-heading text-[0.9375rem] font-semibold text-ink">
                {title}
                {info && <InfoTip label={typeof title === "string" ? title : undefined}>{info}</InfoTip>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={`${flush ? "" : hasHeader ? (divider ? "p-5" : "px-5 pb-5 pt-2") : "p-5"} ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
};
