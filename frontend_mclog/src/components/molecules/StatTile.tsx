import React from "react";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Skeleton } from "@/components/atoms/Skeleton";
import { InfoTip } from "@/components/molecules/InfoTip";
import { Sparkline } from "@/components/molecules/Sparkline";

type Accent = "brand" | "error" | "warn" | "info" | "neutral";

// Filo superior de 2 px: el unico sitio donde la tarjeta usa el color de su
// serie. El numero y la etiqueta se quedan en tinta, que siempre se lee.
const ACCENT_EDGE: Record<Accent, string> = {
  brand: "bg-brand",
  error: "bg-lvl-error",
  warn: "bg-lvl-warn",
  info: "bg-lvl-info",
  neutral: "bg-line-strong",
};

const TREND_COLOR: Record<Accent, string> = {
  brand: "text-brand",
  error: "text-lvl-error",
  warn: "text-lvl-warn",
  info: "text-lvl-info",
  neutral: "text-ink-3",
};

/** Color del cambio: rojo si empeora, verde si mejora, neutro si da igual. */
const CHANGE_TONE = { bad: "text-danger", good: "text-success", neutral: "text-ink-2" } as const;

type StatTileProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Que mide la metrica y como se calcula: se abre al pasar por el icono. */
  info?: React.ReactNode;
  icon?: IconName;
  accent?: Accent;
  trend?: number[];
  /**
   * Cambio frente al periodo anterior. `tone` dice si subir es malo (errores),
   * bueno o indiferente (volumen), para el color; la flecha da la direccion.
   */
  change?: { label: string; direction: "up" | "down" | "flat"; tone: "bad" | "good" | "neutral"; title?: string };
  loading?: boolean;
  /** Atenua el valor mientras se refrescan los datos, sin saltos de maquetacion. */
  stale?: boolean;
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  hint,
  info,
  icon,
  accent = "neutral",
  trend,
  change,
  loading,
  stale,
}) => (
  <div className="relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card">
    <span aria-hidden className={`absolute inset-x-4 top-0 h-0.5 rounded-b-full ${ACCENT_EDGE[accent]}`} />
    <div className="flex items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-ink-2">
        <span className="truncate">{label}</span>
        {info && !icon && <InfoTip label={label}>{info}</InfoTip>}
      </p>
      {icon &&
        (info ? (
          // El icono es la ayuda: se abre al pasar el raton, con el teclado o al pulsarlo.
          <InfoTip
            label={label}
            trigger={<Icon name={icon} className="h-3.5 w-3.5" />}
            className="flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-lg bg-surface-2 text-ink-3 ring-1 ring-inset ring-line transition-colors hover:text-ink hover:ring-line-strong aria-expanded:text-brand aria-expanded:ring-brand/40"
          >
            {info}
          </InfoTip>
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3 ring-1 ring-inset ring-line">
            <Icon name={icon} className="h-3.5 w-3.5" />
          </span>
        ))}
    </div>

    {loading ? (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    ) : (
      <div className={`transition-opacity ${stale ? "opacity-60" : ""}`}>
        <div className="flex items-end justify-between gap-3">
          {/* El numero manda: nunca se recorta; es la tendencia la que cede sitio. */}
          <p className="min-w-0 shrink-0 whitespace-nowrap text-[1.75rem] font-semibold leading-none tracking-tight text-ink">
            {value}
          </p>
          {trend && trend.length > 1 && (
            <div className="min-w-0 max-w-[8rem] flex-1 3xl:max-w-[10rem]">
              <Sparkline values={trend} colorClass={TREND_COLOR[accent]} height={32} />
            </div>
          )}
        </div>
        {(hint || change) && (
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
            {change && (
              <span title={change.title} className={`inline-flex shrink-0 items-center gap-0.5 font-medium ${CHANGE_TONE[change.tone]}`}>
                <Icon name={change.direction === "up" ? "arrowUp" : change.direction === "down" ? "arrowDown" : "arrowRight"} className="h-3 w-3" />
                {change.label}
              </span>
            )}
            {hint && <span className="truncate">{hint}</span>}
          </p>
        )}
      </div>
    )}
  </div>
);
