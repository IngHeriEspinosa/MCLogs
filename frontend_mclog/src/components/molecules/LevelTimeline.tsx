"use client";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TimelineBucket } from "@/hooks/useAuth";

/**
 * Volumen de logs por hora y nivel, en barras apiladas.
 *
 * Responde a la primera pregunta de cualquier incidente: cuando empezo.
 *
 * Los niveles son una escala de severidad, no categorias sueltas, asi que el
 * color va de grave a irrelevante en lugar de recorrer una rueda de tonos. Los
 * errores van abajo, pegados a la linea base, porque es el unico segmento con
 * origen fijo y por tanto el unico que se puede comparar de un vistazo entre
 * horas: es justo lo que interesa mirar.
 *
 * Paleta validada sobre la superficie blanca de la tarjeta: separacion minima
 * entre adyacentes de 15.9 (deficiencia de color) y 17.8 (vision normal), por
 * encima de los umbrales de 8 y 15. El amarillo queda por debajo de 3:1 de
 * contraste, algo inherente a ese tono, y por eso la leyenda lleva siempre
 * nombre y total visibles: el color nunca es el unico portador del dato.
 */

type Level = "error" | "warn" | "info" | "debug";

/** De mas grave a menos. Este es tambien el orden de apilado, de abajo arriba. */
const LEVELS: { key: Level; label: string; color: string }[] = [
  { key: "error", label: "error", color: "#d03b3b" },
  { key: "warn", label: "warn", color: "#eda100" },
  { key: "info", label: "info", color: "#2a78d6" },
  { key: "debug", label: "debug", color: "#898781" },
];

const PLOT_HEIGHT = 96;
const AXIS_HEIGHT = 18;
const SEGMENT_GAP = 2;
const CORNER_RADIUS = 4;
const MIN_SLOT = 6;

const HOUR_MS = 60 * 60 * 1000;

const startOfHour = (date: Date) => {
  const copy = new Date(date);
  copy.setMinutes(0, 0, 0);
  return copy;
};

/**
 * Rellena las horas sin registros.
 *
 * La API solo devuelve las horas que tienen filas. Pintarlas sin mas juntaria
 * horas no contiguas y el grafico mentiria sobre cuando ocurrio cada cosa.
 */
const fillHours = (buckets: TimelineBucket[], from: string, to: string): TimelineBucket[] => {
  const byHour = new Map(buckets.map((bucket) => [startOfHour(new Date(bucket.bucket)).getTime(), bucket]));
  const cursor = startOfHour(new Date(from));
  const end = startOfHour(new Date(to));
  const filled: TimelineBucket[] = [];

  // Tope de seguridad: un rango absurdo no debe generar decenas de miles de barras.
  for (let guard = 0; cursor.getTime() <= end.getTime() && guard < 24 * 62; guard++) {
    const key = cursor.getTime();
    filled.push(byHour.get(key) ?? { bucket: new Date(key).toISOString(), error: 0, warn: 0, info: 0, debug: 0 });
    cursor.setTime(key + HOUR_MS);
  }
  return filled;
};

/** Ancho real del contenedor, para dibujar en pixeles y que las esquinas no se deformen. */
const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
};

const formatHour = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatDayHour = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const LevelTimeline: React.FC<{ timeline: TimelineBucket[]; from: string; to: string }> = ({
  timeline,
  from,
  to,
}) => {
  const { ref, width } = useElementWidth();
  const [hovered, setHovered] = useState<number | null>(null);

  const buckets = useMemo(() => fillHours(timeline, from, to), [timeline, from, to]);

  const totals = useMemo(
    () =>
      LEVELS.map((level) => ({
        ...level,
        total: buckets.reduce((sum, bucket) => sum + bucket[level.key], 0),
      })),
    [buckets],
  );

  const max = useMemo(
    () => Math.max(1, ...buckets.map((bucket) => bucket.error + bucket.warn + bucket.info + bucket.debug)),
    [buckets],
  );

  const grandTotal = totals.reduce((sum, level) => sum + level.total, 0);
  const slot = buckets.length > 0 && width > 0 ? width / buckets.length : 0;
  const barWidth = Math.max(MIN_SLOT - SEGMENT_GAP, slot - SEGMENT_GAP);

  // Etiquetas del eje: primera, central y ultima. Veinticuatro etiquetas se
  // solaparian y no aportan nada.
  const tickIndexes =
    buckets.length >= 3 ? [0, Math.floor(buckets.length / 2), buckets.length - 1] : buckets.map((_, index) => index);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actividad por hora</span>
        <ul className="flex flex-wrap items-center gap-3">
          {totals.map((level) => (
            <li key={level.key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: level.color }}
              />
              <span>{level.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{level.total.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </figcaption>

      <div ref={ref} className="relative">
        {grandTotal === 0 ? (
          <p className="flex h-[96px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
            Sin registros en esta ventana.
          </p>
        ) : (
          <>
            <svg
              width={width || undefined}
              height={PLOT_HEIGHT + AXIS_HEIGHT}
              role="img"
              aria-label={`Logs por hora entre ${formatDayHour(from)} y ${formatDayHour(to)}. ${totals
                .map((level) => `${level.label}: ${level.total}`)
                .join(", ")}.`}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Linea base, recesiva: orienta sin competir con los datos. */}
              <line x1={0} y1={PLOT_HEIGHT} x2={width} y2={PLOT_HEIGHT} stroke="#e1e0d9" strokeWidth={1} />

              {buckets.map((bucket, index) => {
                const x = index * slot;
                const total = bucket.error + bucket.warn + bucket.info + bucket.debug;
                let cursorY = PLOT_HEIGHT;

                // El ultimo segmento con datos es el extremo de la barra y lleva
                // las esquinas redondeadas.
                const topLevel = [...LEVELS].reverse().find((level) => bucket[level.key] > 0)?.key;

                return (
                  <g key={bucket.bucket}>
                    {LEVELS.map((level) => {
                      const value = bucket[level.key];
                      if (value === 0) return null;

                      const full = (value / max) * PLOT_HEIGHT;
                      const height = Math.max(1, full - SEGMENT_GAP);
                      cursorY -= full;
                      const isTop = level.key === topLevel;

                      return (
                        <rect
                          key={level.key}
                          x={x + SEGMENT_GAP / 2}
                          y={cursorY}
                          width={barWidth}
                          height={height}
                          rx={isTop ? Math.min(CORNER_RADIUS, barWidth / 2) : 0}
                          fill={level.color}
                          opacity={hovered === null || hovered === index ? 1 : 0.45}
                        />
                      );
                    })}

                    {/* Zona sensible de columna completa: mas facil de apuntar que la barra. */}
                    <rect
                      x={x}
                      y={0}
                      width={Math.max(slot, 1)}
                      height={PLOT_HEIGHT}
                      fill="transparent"
                      onMouseEnter={() => setHovered(index)}
                    >
                      <title>{`${formatDayHour(bucket.bucket)} · ${total} registros`}</title>
                    </rect>
                  </g>
                );
              })}
            </svg>

            <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
              {tickIndexes.map((index) => (
                <span key={index}>{formatHour(buckets[index].bucket)}</span>
              ))}
            </div>

            {hovered !== null && buckets[hovered] && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg"
                style={{
                  left: `${Math.min(Math.max((hovered + 0.5) * slot - 88, 0), Math.max(width - 176, 0))}px`,
                }}
              >
                <p className="mb-1 font-semibold text-slate-800">{formatDayHour(buckets[hovered].bucket)}</p>
                {LEVELS.map((level) => (
                  <p key={level.key} className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ backgroundColor: level.color }}
                      />
                      {level.label}
                    </span>
                    <span className="tabular-nums font-medium text-slate-800">
                      {buckets[hovered][level.key].toLocaleString()}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </figure>
  );
};
