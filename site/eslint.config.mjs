/**
 * ESLint del sitio público (configuración flat, ESLint 9): las reglas de Next
 * (core-web-vitals), que ya incluyen las básicas de accesibilidad.
 */
import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  // Generados: el sitio exportado, el build y los tipos de Next.
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"] },
  ...nextVitals,
];

export default config;
