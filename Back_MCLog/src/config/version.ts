import { readFileSync } from "fs";
import { join } from "path";

/**
 * Version declarada en package.json. Se lee en tiempo de ejecucion en lugar de
 * importar el JSON porque package.json queda fuera de `rootDir`, y la ruta
 * relativa funciona igual ejecutando desde `src/` con ts-node que desde `dist/`.
 */
const readVersion = (): string => {
  try {
    const raw = readFileSync(join(__dirname, "..", "..", "package.json"), "utf8");
    return (JSON.parse(raw).version as string) || "unknown";
  } catch {
    return "unknown";
  }
};

export const APP_VERSION = readVersion();
