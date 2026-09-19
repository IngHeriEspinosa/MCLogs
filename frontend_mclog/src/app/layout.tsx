import type { Metadata } from "next";
import "../styles/globals.css";
import React from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MCLog",
  description: "Consola de monitoreo de logs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
