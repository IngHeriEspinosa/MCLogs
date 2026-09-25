import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import React from "react";
import "../styles/globals.css";
import { Providers } from "./providers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage } from "@/common/i18n/config";
import { requestOrigin } from "@/common/requestOrigin";
import { isThemePreference, THEME_COOKIE, themeBootstrapScript } from "@/common/theme/config";

// next/font descarga las fuentes al compilar y las sirve desde el propio
// dashboard: sin peticiones a Google en cada visita, algo que importa en un
// servicio autoalojado, y sin salto de maquetacion al cargar.
const body = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const heading = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-heading" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });

const DESCRIPTION = "Consola de logs centralizados · Centralized log console";

/**
 * La vista previa de cualquier enlace al panel (Teams, Slack, WhatsApp…) usa
 * `opengraph-image.tsx`; su URL tiene que ser absoluta y el dominio depende de
 * donde se despliegue, asi que el origen sale de la peticion.
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: requestOrigin(),
    title: { default: "MCLog", template: "%s · MCLog" },
    description: DESCRIPTION,
    applicationName: "MCLog",
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "MCLog", title: "MCLog", description: DESCRIPTION },
    twitter: { card: "summary_large_image", title: "MCLog", description: DESCRIPTION },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#081116" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const store = cookies();
  const storedLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : localeFromAcceptLanguage(headers().get("accept-language"));
  const storedTheme = store.get(THEME_COOKIE)?.value;
  const theme = isThemePreference(storedTheme) ? storedTheme : "system";

  return (
    <html
      lang={locale}
      // Con "system" el tema se decide en el navegador (script de abajo), asi
      // que el atributo puede no coincidir con lo que pinto el servidor.
      data-theme={theme === "system" ? undefined : theme}
      className={`${body.variable} ${heading.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <Providers initialLocale={locale} initialTheme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
