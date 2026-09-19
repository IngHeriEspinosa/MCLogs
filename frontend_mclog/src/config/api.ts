/**
 * Base de las llamadas a la API.
 *
 * En desarrollo el dashboard (3001) y la API (3000) son origenes distintos, asi
 * que NEXT_PUBLIC_API_URL debe apuntar a la API.
 *
 * En produccion Caddy sirve ambos bajo el mismo dominio: dejar la variable sin
 * definir deja la base vacia, las peticiones salen relativas y desaparecen tanto
 * el CORS entre origenes como la necesidad de cookies SameSite=None.
 *
 * El valor se fija al compilar, no al arrancar: cambiarlo exige reconstruir.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
