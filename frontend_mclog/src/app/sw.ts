import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

/**
 * Service worker del dashboard (Serwist).
 *
 * Solo guarda lo que no tiene datos: los estaticos con hash del build
 * (precarga), las fuentes y los iconos. Todo lo demas va siempre a la red,
 * sin copia: la API, la autenticacion, el MCP, los snapshots y las paginas,
 * porque llevan logs del espacio y en un panel de monitoreo una copia vieja
 * miente. Sin conexion, la navegacion cae en /~offline.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const sameOrigin = (url: URL) => url.origin === self.location.origin;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Estaticos con hash en el nombre: no cambian nunca, se sirven de la cache.
      matcher: ({ url }) => sameOrigin(url) && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ url }) => sameOrigin(url) && (url.pathname === "/icon.svg" || url.pathname.startsWith("/pwa-icon/")),
      handler: new CacheFirst({ cacheName: "icons", plugins: [new ExpirationPlugin({ maxEntries: 10 })] }),
    },
    // Lo demas, a la red y sin guardar nada.
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
