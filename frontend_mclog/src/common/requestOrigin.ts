import { headers } from "next/headers";

/**
 * Origen publico del dashboard, para que las imagenes de la vista previa vayan
 * con URL absoluta (Open Graph lo exige). Detras de un proxy manda X-Forwarded-*.
 */
export const requestOrigin = (): URL | undefined => {
  const all = headers();
  const host = all.get("x-forwarded-host") ?? all.get("host");
  if (!host) return undefined;
  const proto = all.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  try {
    return new URL(`${proto}://${host}`);
  } catch {
    return undefined;
  }
};
