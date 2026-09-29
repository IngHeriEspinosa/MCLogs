"use client";
// Organism: ReportPrint (el informe maquetado para papel y su exportacion a PDF)
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Logo } from "@/components/atoms/Icon";
import { MarkdownView } from "@/components/molecules/MarkdownView";
import { printInFrame } from "@/common/print";

type ReportPrintProps = {
  source: string;
  /** Solo los enlaces a este origen (el propio MCLog) salen activos en el PDF. */
  linkOrigin?: string;
  brand: string;
  tagline: string;
};

/** El informe tal como sale en papel: cabecera de marca y el Markdown maquetado. */
export const ReportPrintDocument: React.FC<ReportPrintProps> = ({ source, linkOrigin, brand, tagline }) => (
  <article className="report-print">
    <header className="report-print-brand">
      <Logo className="h-7 w-7 shrink-0" />
      <span className="font-heading text-[13pt] font-bold tracking-tight text-ink">{brand}</span>
      <span className="ml-auto font-mono text-[7.5pt] uppercase tracking-[0.14em] text-ink-3">{tagline}</span>
    </header>
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
