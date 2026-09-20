/**
 * El sitio publico (landing + documentacion) se compila a HTML estatico y se
 * publica en GitHub Pages. No comparte nada con el dashboard de
 * `frontend_mclog/`, que sigue viviendo en la instancia privada.
 */

// GitHub Pages sirve un repositorio de proyecto bajo /<repo>, asi que todas las
// rutas y los assets necesitan ese prefijo. Con dominio propio se pone a vacio:
//   SITE_BASE_PATH="" npm run build
const basePath = process.env.SITE_BASE_PATH ?? "/MCLogs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Genera HTML plano en out/. Sin servidor Node: es lo unico que Pages sirve.
  output: "export",
  basePath,
  // Pages no corre el optimizador de imagenes de Next.
  images: { unoptimized: true },
  // Cada ruta como carpeta con su index.html, para que Pages resuelva
  // /docs/faq sin depender de reescrituras que no puede hacer.
  trailingSlash: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
