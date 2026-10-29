import withSerwistInit from "@serwist/next";

/**
 * PWA con Serwist: compila src/app/sw.ts a public/sw.js con la lista de los
 * estaticos del build para precargarlos, y lo registra en el navegador. En
 * desarrollo va apagado: un service worker cacheando mientras se edita solo
 * confunde.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // La pagina sin conexion se precarga al instalar, para tenerla aunque nunca
  // se haya visitado. Su revision cambia con cada build.
  additionalPrecacheEntries: [{ url: "/~offline", revision: `${Date.now()}` }],
  // No se cachea cada pagina visitada: llevan datos de logs del espacio, y una
  // copia vieja de un panel de monitoreo enganaria mas que una pagina sin conexion.
  cacheOnNavigation: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empaqueta el servidor y solo sus dependencias reales en .next/standalone,
  // para que la imagen de produccion no arrastre node_modules entero.
  output: "standalone",
  // La cabecera delata la tecnologia sin aportar nada al cliente.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // El service worker no se cachea nunca: el navegador tiene que ver cada version nueva.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
