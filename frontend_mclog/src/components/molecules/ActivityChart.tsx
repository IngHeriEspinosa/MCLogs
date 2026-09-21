"use client";
import React, { useMemo, useRef, useState } from "react";
import { Level, LEVEL_FILL, LEVEL_SVG_FILL, LEVELS } from "@/components/atoms/LevelBadge";
import { useElementSize, useIsomorphicLayoutEffect } from "@/hooks/useElementSize";
import { useI18n } from "@/common/i18n/I18nProvider";
import { binTimeline, peakBin, sumLevels, TimelineBin } from "@/common/time/timeline";

/**
 * Volumen de logs por intervalo y nivel, en columnas apiladas.
 *
 * Responde a la primera pregunta de cualquier incidente: cuando empezo.
 *
 * - Los errores van abajo, pegados a la linea base: es el unico segmento con
 *   origen fijo y por tanto el unico comparable de un vistazo entre columnas.
 * - Columnas de 24 px como maximo, extremo superior redondeado y base recta,
 *   2 px de hueco entre segmentos. La rejilla es una linea fina y solida.
 * - Solo se rotula el pico; el resto lo cuentan el eje, la leyenda con totales
 *   (el ambar no llega a 3:1 y nunca va solo) y la vista de tabla.
 * - Arrastrar acota el rango y un clic aisla una columna.
 */

const AXIS_HEIGHT = 22;
const TOP_PAD = 18;
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

/** Paso "redondo" para el eje: 1, 2, 2.5, 5 o 10 por potencia de diez. */
const niceStep = (max: number, count: number) => {
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(1, nice * power);
};

/** Rectangulo con solo las esquinas de arriba redondeadas: la base queda recta. */
const topRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

type ActivityChartProps = {
  /** Serie horaria ya rellenada (fillTimeline). */
  hours: TimelineBin[];
  loading?: boolean;
  /** Mientras se refresca, se mantiene el grafico anterior atenuado. */
  stale?: boolean;
  /** Arrastrar o hacer clic acota el rango a esos intervalos. */
  onSelectRange?: (from: number, to: number) => void;
  height?: number;
};

export const ActivityChart: React.FC<ActivityChartProps> = ({ hours, loading, stale, onSelectRange, height = 200 }) => {
  const { t, fmt } = useI18n();
  const { ref, width } = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  // Tamano de la fuente raiz: crece en pantallas 4K (globals.css) y el grafico
  // crece con ella, para no quedarse pequeno junto al resto de la interfaz.
  // Se lee en un efecto de layout y no durante el render: en el servidor no hay
  // fuente raiz, y calcularlo al renderizar descuadraria la hidratacion. El
  // efecto corre antes de pintar, asi que no se ve ningun salto. Basta con
  // releerlo al cambiar de ancho: el tamano raiz solo cambia con el viewport.
  const [rootScale, setRootScale] = useState(1);
  useIsomorphicLayoutEffect(() => {
    setRootScale(parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1);
  }, [width]);
  const chartHeight = Math.round(height * rootScale);
  const axisHeight = AXIS_HEIGHT * rootScale;
  const topPad = TOP_PAD * rootScale;
  const plotHeight = chartHeight - axisHeight - topPad;
  // El numero de columnas se decide con un eje estimado; el eje real depende
  // de las etiquetas, que dependen a su vez de las columnas.
  const maxBars = Math.max(12, Math.floor((width - 56) / 10));

  const { bins, stepHours } = useMemo(() => binTimeline(hours, maxBars), [hours, maxBars]);
  const totals = useMemo(() => sumLevels(bins), [bins]);
  const peak = useMemo(() => peakBin(bins), [bins]);

  const step = niceStep(Math.max(peak?.total ?? 0, 1), 4);
  const yMax = Math.max(step, Math.ceil((peak?.total ?? 0) / step) * step);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, index) => index * step);

  // Ancho del eje Y segun su etiqueta mas larga ("12,9 mil" no cabe donde "40").
  const axisWidth = (Math.max(...ticks.map((tick) => fmt.compact(tick).length)) * 8 + 12) * rootScale;
  const plotWidth = Math.max(0, width - axisWidth);

  const slot = bins.length > 0 ? plotWidth / bins.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR, slot - GAP));
  const y = (value: number) => topPad + plotHeight - (value / yMax) * plotHeight;

  const spanHours = hours.length;
  const formatTick = (time: number) =>
    stepHours >= 24 ? fmt.dayMonth(time) : spanHours > 24 ? fmt.dateTimeShort(time) : fmt.time(time);
  const formatInterval = (bin: TimelineBin) =>
    `${fmt.dateTimeShort(bin.start)} – ${stepHours >= 24 ? fmt.dateTimeShort(bin.end) : fmt.time(bin.end)}`;

  // Etiquetas del eje X: tantas como quepan sin tocarse. El ancho se estima
  // con la fuente monoespaciada y el tamano raiz real, que crece en 4K.
  const labelWidth = (bins.length ? formatTick(bins[0].start).length : 5) * 6.9 * rootScale;
  const labelGap = 14 * rootScale;
  const labelCount = Math.max(2, Math.min(bins.length, Math.floor(plotWidth / (labelWidth + labelGap))));
  const candidates =
    bins.length <= 1
      ? [0]
      : Array.from(new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (bins.length - 1)) / (labelCount - 1)))));
  // La primera se alinea a la izquierda y la ultima a la derecha; las de en
  // medio, centradas. Se descarta cualquiera que invada a la anterior, y la
  // ultima tiene prioridad sobre su vecina porque marca el final del rango.
  const extent = (index: number, position: number, total: number): [number, number] => {
    if (position === 0) return [index * slot, index * slot + labelWidth];
    if (position === total - 1) return [(index + 1) * slot - labelWidth, (index + 1) * slot];
    const center = (index + 0.5) * slot;
    return [center - labelWidth / 2, center + labelWidth / 2];
  };
  const labelIndexes = candidates.reduce<number[]>((kept, index, position) => {
    const [left] = extent(index, position, candidates.length);
    const previous = kept[kept.length - 1];
    if (previous === undefined) return [index];
    const [, previousRight] = extent(previous, candidates.indexOf(previous), candidates.length);
    if (left >= previousRight + labelGap) return [...kept, index];
    return position === candidates.length - 1 && kept.length > 1 ? [...kept.slice(0, -1), index] : kept;
  }, []);

  const indexAt = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || slot === 0) return 0;
    return Math.max(0, Math.min(bins.length - 1, Math.floor((clientX - rect.left - axisWidth) / slot)));
  };

  const commitSelection = (a: number, b: number) => {
    const [low, high] = a <= b ? [a, b] : [b, a];
    if (bins[low] && bins[high]) onSelectRange?.(bins[low].start, bins[high].end);
  };

  const summary = LEVELS.map((level) => `${t.levels.names[level]}: ${fmt.number(totals[level])}`).join(", ");
  const active = drag ? drag.to : hovered;
  const tooltipBin = active !== null ? bins[active] : null;
  const tooltipLeft =
    active !== null
      ? Math.min(Math.max(axisWidth + (active + 0.5) * slot - 104 * rootScale, 0), Math.max(width - 208 * rootScale, 0))
      : 0;

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {LEVELS.map((level) => (
        <li key={level} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-[3px] ${LEVEL_FILL[level]}`} />
          <span>{t.levels.names[level]}</span>
          <span className="font-semibold tabular-nums text-ink">{fmt.compact(totals[level])}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {legend}
        <div className="flex items-center gap-3 text-xs text-ink-3">
          {bins.length > 0 && <span className="hidden font-mono sm:inline">{t.overview.resolution(t.time.hours(stepHours))}</span>}
          <button
            type="button"
            onClick={() => setView((current) => (current === "chart" ? "table" : "chart"))}
            className="font-medium text-brand hover:underline"
          >
            {view === "chart" ? t.common.tableView : t.common.chartView}
          </button>
        </div>
      </figcaption>

      <div ref={ref} className={`relative transition-opacity ${stale ? "opacity-60" : ""}`}>
        {loading ? (
          <div className="flex items-end gap-1.5" style={{ height: chartHeight }}>
            {Array.from({ length: 28 }).map((_, index) => (
              <div key={index} aria-hidden className="skeleton flex-1" style={{ height: `${25 + ((index * 37) % 60)}%` }} />
            ))}
          </div>
        ) : view === "table" ? (
          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-left text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">{t.overview.interval}</th>
                  {LEVELS.map((level) => (
                    <th key={level} className="px-3 py-2 text-right font-medium">
                      {t.levels.names[level]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">{t.overview.total}</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((bin) => (
                  <tr key={bin.start} className="border-t border-line">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-ink-2">{formatInterval(bin)}</td>
                    {LEVELS.map((level) => (
                      <td key={level} className="px-3 py-1.5 text-right tabular-nums text-ink-2">
                        {fmt.number(bin[level])}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-ink">{fmt.number(bin.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : totals.total === 0 ? (
          <div
            className="flex items-center justify-center rounded-xl border border-line bg-surface-2 text-sm text-ink-3"
            style={{ height: chartHeight }}
          >
            {t.overview.noActivity}
          </div>
        ) : (
          <div
            tabIndex={0}
            role="img"
            aria-label={t.overview.chartLabel(
              fmt.dateTimeShort(bins[0].start),
              fmt.dateTimeShort(bins[bins.length - 1].end),
              summary,
            )}
            className="rounded-lg focus-visible:outline-offset-4"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? 1 : -1;
                setHovered((current) => Math.max(0, Math.min(bins.length - 1, (current ?? bins.length - 1) + (current === null ? 0 : delta))));
              } else if (event.key === "Enter" && hovered !== null && onSelectRange) {
                event.preventDefault();
                commitSelection(hovered, hovered);
              } else if (event.key === "Escape") {
                setHovered(null);
              }
            }}
            onBlur={() => setHovered(null)}
          >
            <svg
              ref={svgRef}
              width={width}
              height={chartHeight}
              className={`block touch-none ${onSelectRange ? "cursor-crosshair" : ""}`}
              onPointerDown={(event) => {
                if (!onSelectRange || event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const index = indexAt(event.clientX);
                setDrag({ from: index, to: index });
              }}
              onPointerMove={(event) => {
                const index = indexAt(event.clientX);
                setHovered(index);
                if (drag) setDrag({ ...drag, to: index });
              }}
              onPointerUp={() => {
                if (drag) commitSelection(drag.from, drag.to);
                setDrag(null);
              }}
              onPointerLeave={() => {
                if (!drag) setHovered(null);
              }}
            >
              {/* Rejilla: lineas finas y solidas, un paso por encima de la superficie. */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={axisWidth}
                    x2={width}
                    y1={y(tick)}
                    y2={y(tick)}
                    className={tick === 0 ? "stroke-line-strong" : "stroke-line"}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={axisWidth - 8}
                    y={y(tick)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-ink-3 font-mono text-[0.6875rem] tabular-nums"
                  >
                    {fmt.compact(tick)}
                  </text>
                </g>
              ))}

              {/* Columna bajo el puntero: se ilumina el fondo, no se tocan los datos. */}
              {active !== null && !drag && (
                <rect
                  x={axisWidth + active * slot}
                  y={topPad}
                  width={slot}
                  height={plotHeight}
                  rx={4}
                  className="fill-surface-3"
                />
              )}

              {drag && (
                <rect
                  x={axisWidth + Math.min(drag.from, drag.to) * slot}
                  y={topPad}
                  width={(Math.abs(drag.to - drag.from) + 1) * slot}
                  height={plotHeight}
                  className="fill-brand/15 stroke-brand"
                  strokeWidth={1}
                />
              )}

              {bins.map((bin, index) => {
                const x = axisWidth + index * slot + (slot - barWidth) / 2;
                const top = [...LEVELS].reverse().find((level) => bin[level] > 0);
                let cursor = topPad + plotHeight;
                return (
                  <g key={bin.start}>
                    {LEVELS.map((level: Level) => {
                      const value = bin[level];
                      if (value === 0) return null;
                      const full = (value / yMax) * plotHeight;
                      // El hueco se descuenta del segmento de arriba, no se suma:
                      // la altura total sigue siendo fiel al valor.
                      const segment = Math.max(1, full - (level === top ? 0 : GAP));
                      cursor -= full;
                      const yTop = level === top ? cursor : cursor + GAP;
                      return level === top ? (
                        <path key={level} d={topRoundedRect(x, yTop, barWidth, segment, RADIUS)} className={LEVEL_SVG_FILL[level]} />
                      ) : (
                        <rect key={level} x={x} y={yTop} width={barWidth} height={segment} className={LEVEL_SVG_FILL[level]} />
                      );
                    })}
                  </g>
                );
              })}

              {/* Unica etiqueta directa: el pico. */}
              {peak && (
                <text
                  x={Math.min(
                    Math.max(axisWidth + (bins.indexOf(peak) + 0.5) * slot, axisWidth + 16),
                    width - 16,
                  )}
                  y={y(peak.total) - 6}
                  textAnchor="middle"
                  className="fill-ink-2 font-mono text-[0.6875rem] font-medium tabular-nums"
                >
                  {fmt.compact(peak.total)}
                </text>
              )}

              {labelIndexes.map((index, position) => {
                const bin = bins[index];
                if (!bin) return null;
                const anchor = position === 0 ? "start" : position === labelIndexes.length - 1 ? "end" : "middle";
                const x =
                  anchor === "start"
                    ? axisWidth + index * slot
                    : anchor === "end"
                      ? axisWidth + (index + 1) * slot
                      : axisWidth + (index + 0.5) * slot;
                return (
                  <text
                    key={bin.start}
                    x={x}
                    y={chartHeight - 6 * rootScale}
                    textAnchor={anchor}
                    className="fill-ink-3 font-mono text-[0.6875rem] tabular-nums"
                  >
                    {formatTick(bin.start)}
                  </text>
                );
              })}
            </svg>

            {tooltipBin && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-52 animate-fade-in rounded-xl border border-line bg-surface p-3 text-xs shadow-pop"
                style={{ left: tooltipLeft }}
              >
                <p className="mb-2 font-mono text-[0.6875rem] text-ink-3">{formatInterval(tooltipBin)}</p>
                <ul className="flex flex-col gap-1">
                  {LEVELS.map((level) => (
                    <li key={level} className="flex items-center gap-2">
                      <span aria-hidden className={`h-0.5 w-3 rounded-full ${LEVEL_FILL[level]}`} />
                      <span className="font-semibold tabular-nums text-ink">{fmt.number(tooltipBin[level])}</span>
                      <span className="text-ink-3">{t.levels.names[level]}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t border-line pt-2 text-ink-2">
                  <span>{t.overview.total}</span>
                  <span className="font-semibold tabular-nums text-ink">{fmt.number(tooltipBin.total)}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      {onSelectRange && view === "chart" && totals.total > 0 && !loading && (
        <p className="text-[0.6875rem] text-ink-3">{t.overview.activityHint}</p>
      )}
    </figure>
  );
};
