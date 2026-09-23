import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolucion de modulos para los tests con el runner nativo de Node.
 *
 * Node ya ejecuta TypeScript quitando los tipos, pero no conoce los alias de
 * tsconfig ("@/common/...") ni los imports sin extension que usa Next. Este
 * hook traduce ambos; no hace falta ninguna dependencia nueva.
 */
const SRC = new URL("../src/", import.meta.url);
const CANDIDATES = [".ts", ".tsx", "/index.ts"];

const withExtension = (url) => {
  if (/\.[cm]?[jt]sx?$/.test(url.pathname)) return url.href;
  const match = CANDIDATES.map((suffix) => new URL(url.href + suffix)).find((candidate) => existsSync(fileURLToPath(candidate)));
  return match ? match.href : url.href;
};

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(withExtension(new URL(specifier.slice(2), SRC)), context);
  const local = specifier.startsWith("./") || specifier.startsWith("../");
  if (local && context.parentURL?.startsWith(new URL("..", SRC).href)) {
    return next(withExtension(new URL(specifier, context.parentURL)), context);
  }
  return next(specifier, context);
}
