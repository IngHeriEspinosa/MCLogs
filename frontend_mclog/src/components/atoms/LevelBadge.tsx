import React from "react";

export type Level = "error" | "warn" | "info" | "debug";

export const LEVELS: Level[] = ["error", "warn", "info", "debug"];

/** Clase de relleno de cada nivel, para puntos, barras y marcas de graficos. */
export const LEVEL_FILL: Record<Level, string> = {
  error: "bg-lvl-error",
  warn: "bg-lvl-warn",
  info: "bg-lvl-info",
  debug: "bg-lvl-debug",
};

export const LEVEL_SVG_FILL: Record<Level, string> = {
  error: "fill-lvl-error",
  warn: "fill-lvl-warn",
  info: "fill-lvl-info",
  debug: "fill-lvl-debug",
};

// El texto nunca lleva el color del grafico (el ambar sobre blanco no llega a
// 3:1): usa el tono de estado del mismo matiz, que si pasa 4.5:1 sobre su fondo.
const TONE: Record<Level, string> = {
  error: "bg-lvl-error/10 text-danger ring-lvl-error/25",
  warn: "bg-lvl-warn/15 text-warning ring-lvl-warn/30",
  info: "bg-lvl-info/10 text-info ring-lvl-info/25",
  debug: "bg-surface-3 text-ink-3 ring-line-strong/70",
};

export const isLevel = (value: string): value is Level =>
  value === "error" || value === "warn" || value === "info" || value === "debug";

export const LevelBadge: React.FC<{ level: string; className?: string }> = ({ level, className = "" }) => {
  const key: Level = isLevel(level) ? level : "debug";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold uppercase leading-4 tracking-wide ring-1 ring-inset ${TONE[key]} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${LEVEL_FILL[key]}`} />
      {level}
    </span>
  );
};

/** Punto del color del nivel, para listas compactas. */
export const LevelDot: React.FC<{ level: string; className?: string }> = ({ level, className = "" }) => (
  <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${LEVEL_FILL[isLevel(level) ? level : "debug"]} ${className}`} />
);
