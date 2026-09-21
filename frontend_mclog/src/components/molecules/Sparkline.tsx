"use client";
import React from "react";
import { useElementSize } from "@/hooks/useElementSize";

type SparklineProps = {
  values: number[];
  /** Clase de color de texto: la linea y el relleno usan currentColor. */
  colorClass?: string;
  height?: number;
};

const PAD = 4;

/**
 * Tendencia minima para una tarjeta de metrica: linea de 2 px, velo al 10 %
 * y punto final con anillo del color de la superficie. Sin ejes ni etiquetas;
 * el valor exacto ya esta en la tarjeta.
 */
export const Sparkline: React.FC<SparklineProps> = ({ values, colorClass = "text-brand", height = 36 }) => {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const count = values.length;
  const max = Math.max(1, ...values);

  const points =
    width > 0 && count > 1
      ? values.map((value, index) => ({
          x: PAD + (index * (width - 2 * PAD)) / (count - 1),
          y: PAD + (1 - value / max) * (height - 2 * PAD),
        }))
      : [];

  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("");
  const last = points[points.length - 1];

  return (
    <div ref={ref} className={`w-full ${colorClass}`} style={{ height }} aria-hidden>
      {points.length > 1 && last && (
        <svg width={width} height={height} className="overflow-visible">
          <path d={`${line}L${last.x},${height}L${points[0].x},${height}Z`} fill="currentColor" opacity={0.1} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={last.x} cy={last.y} r={3.5} fill="currentColor" stroke="rgb(var(--surface))" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
};
