"use client";
// Organism: ReportPrint (el informe maquetado para papel y su exportacion a PDF)
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Logo } from "@/components/atoms/Icon";
import { MarkdownView } from "@/components/molecules/MarkdownView";
import { printInFrame } from "@/common/print";
import { binTimeline, peakBin, type TimelineBin } from "@/common/time/timeline";
import { LEVEL_SVG_FILL } from "@/components/atoms/LevelBadge";

type ReportPrintProps = {
  source: string;
  /** Solo los enlaces a este origen (el propio MCLog) salen activos en el PDF. */
  linkOrigin?: string;
  brand: string;
  tagline: string;
  /** Serie de la actividad: se dibuja como grafico de columnas, que el Markdown no puede. */
  chart?: TimelineBin[];
  chartTitle?: string;
};

const CHART_WIDTH = 680;
const CHART_HEIGHT = 150;

/**
 * Columnas apiladas (error abajo, warning, y el resto) en SVG, para el PDF. Es
 * estatico a proposito: en papel no hay tooltip, asi que el pico lleva su cifra.
 */
const PrintActivityChart: React.FC<{ hours: TimelineBin[]; title: string }> = ({ hours, title }) => {
  const { bins } = binTimeline(hours, 48);
  const peak = peakBin(bins);
  const max = Math.max(1, peak?.total ?? 0);
  const slot = CHART_WIDTH / Math.max(1, bins.length);
  const bar = Math.max(1, slot - 2);
  const y = (value: number) => (value / max) * (CHART_HEIGHT - 16);
  return (
    <figure className="report-print-chart">
      <svg role="img" aria-label={title} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} width="100%">
        <line x1={0} x2={CHART_WIDTH} y1={CHART_HEIGHT - 0.5} y2={CHART_HEIGHT - 0.5} className="stroke-line-strong" />
        {bins.map((bin, index) => {
          const x = index * slot + (slot - bar) / 2;
          const errorHeight = y(bin.error);
          const warnHeight = y(bin.warn);
          const restHeight = y(bin.info + bin.debug);
          return (
            <g key={bin.start}>
              <rect x={x} y={CHART_HEIGHT - errorHeight} width={bar} height={errorHeight} className={LEVEL_SVG_FILL.error} />
              <rect x={x} y={CHART_HEIGHT - errorHeight - warnHeight} width={bar} height={warnHeight} className={LEVEL_SVG_FILL.warn} />
              <rect x={x} y={CHART_HEIGHT - errorHeight - warnHeight - restHeight} width={bar} height={restHeight} className={LEVEL_SVG_FILL.info} />
            </g>
          );
        })}
        {peak && (
          <text x={Math.min(Math.max((bins.indexOf(peak) + 0.5) * slot, 12), CHART_WIDTH - 12)} y={CHART_HEIGHT - y(peak.total) - 4} textAnchor="middle" className="fill-ink-2 font-mono text-[8pt]">
            {peak.total}
          </text>
        )}
      </svg>
      <figcaption className="font-mono text-[7.5pt] text-ink-3">{title}</figcaption>
    </figure>
  );
};

/** El informe tal como sale en papel: cabecera de marca y el Markdown maquetado. */
export const ReportPrintDocument: React.FC<ReportPrintProps> = ({ source, linkOrigin, brand, tagline, chart, chartTitle }) => (
  <article className="report-print">
    <header className="report-print-brand">
      <Logo className="h-7 w-7 shrink-0" />
      <span className="font-heading text-[13pt] font-bold tracking-tight text-ink">{brand}</span>
      <span className="ml-auto font-mono text-[7.5pt] uppercase tracking-[0.14em] text-ink-3">{tagline}</span>
    </header>
    {chart && chart.length > 0 && <PrintActivityChart hours={chart} title={chartTitle ?? ""} />}
    <MarkdownView source={source} linkOrigin={linkOrigin} />
  </article>
);

type PrintReportOptions = ReportPrintProps & {
  /** Nombre que el navegador propone para el PDF, sin extension. */
  title: string;
  lang: string;
  footer: string;
};

/**
 * Abre el dialogo de impresion con el informe; ahi se elige "Guardar como PDF".
 * Todo ocurre en el navegador, como el resto del reporte.
 */
export const printReportPdf = ({ title, lang, footer, ...document }: PrintReportOptions): Promise<void> =>
  printInFrame({
    title,
    lang,
    footer,
    render: (container) => {
      const root = createRoot(container);
      // Sincrono: el iframe se imprime justo despues y tiene que estar pintado.
      flushSync(() => root.render(<ReportPrintDocument {...document} />));
      return () => root.unmount();
    },
  });
