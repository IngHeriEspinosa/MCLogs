import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA: instalar el panel como aplicacion (escritorio o movil)
 * abre directo en Logs, en su propia ventana. Los iconos PNG los genera
 * pwa-icon/[size]; el SVG vale para los navegadores que lo admiten.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MCLog — Logs centralizados",
    short_name: "MCLog",
    description: "Consola de logs centralizados · Centralized log console",
    start_url: "/logs",
    scope: "/",
    display: "standalone",
    background_color: "#081116",
    theme_color: "#19607e",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
