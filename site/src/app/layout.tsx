import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_URL } from "@/lib/site";
import "@/styles/globals.css";
// Tema de highlight.js para los bloques de codigo, claros sobre fondo oscuro.
import "highlight.js/styles/github-dark.css";

// next/font descarga y autoaloja las fuentes en el build: sin peticion a
// Google en runtime y sin salto de maquetacion al cargar.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-jakarta" });

const DESCRIPTION =
  "Servicio de logs centralizados, open source y autoalojado. Captura, agrupa y consulta los logs de todas tus aplicaciones (Node.js, Python, NetSuite o cualquier HTTP) desde un solo sitio.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MCLog — Logs centralizados, open source y autoalojados",
    template: "%s · MCLog",
  },
  description: DESCRIPTION,
  applicationName: "MCLog",
  authors: [{ name: "Heri Espinosa" }],
  keywords: [
    "logs centralizados",
    "observabilidad",
    "open source",
    "autoalojado",
    "self-hosted",
    "NetSuite",
    "SuiteScript",
    "Node.js",
    "MCP",
  ],
  openGraph: {
    type: "website",
    siteName: "MCLog",
    locale: "es_ES",
    url: SITE_URL,
    title: "MCLog — Logs centralizados, open source y autoalojados",
    description: DESCRIPTION,
  },
  twitter: {
    // "summary" y no "summary_large_image" porque todavia no hay imagen de
    // portada. Para anadirla: deja un PNG de 1200x630 en public/og.png y pon
    //   images: ["/og.png"]
    // en `openGraph` y aqui; con eso la tarjeta grande ya funciona.
    card: "summary",
    title: "MCLog — Logs centralizados, open source y autoalojados",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
