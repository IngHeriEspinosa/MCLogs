/** Datos del proyecto que se repiten por todo el sitio. */

export const GITHUB_REPO = "https://github.com/IngHeriEspinosa/MCLogs";

/** Dominio publico del sitio. Cambialo si algun dia se usa dominio propio. */
export const SITE_URL = "https://inghieriespinosa.github.io/MCLogs";

/**
 * Debe coincidir con `basePath` de next.config.js. `next/link` lo antepone
 * solo, pero los `href` sueltos (un <a> a un fichero de public/) no.
 */
export const BASE_PATH = process.env.SITE_BASE_PATH ?? "/MCLogs";

export const NPM_PACKAGE = "@enviromentmc/mclog";
export const NPM_URL = "https://www.npmjs.com/package/@enviromentmc/mclog";

/** Ruta de un fichero dentro de public/, con el prefijo de GitHub Pages. */
export const asset = (path: string) => `${BASE_PATH}${path}`;

/** Enlace a un fichero del repositorio en GitHub. */
export const repoFile = (path: string) => `${GITHUB_REPO}/blob/main/${path}`;

export const NAV_LINKS = [
  { href: "/docs", label: "Documentación" },
  { href: "/#para-quien", label: "Para quién es" },
  { href: "/#ejemplos", label: "Ejemplos" },
  { href: "/#instalacion", label: "Instalación" },
] as const;
