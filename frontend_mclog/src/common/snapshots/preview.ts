import type { Dictionary } from "@/common/i18n/dictionaries";
import type { Formatter } from "@/common/i18n/format";
import type { SnapshotKind } from "@/hooks/useSnapshots";

/**
 * Vista previa de un enlace de snapshot, para las etiquetas Open Graph que leen
 * Slack, WhatsApp, Teams… Se calcula en el servidor de Next: el robot que pide
 * la vista previa no ejecuta JavaScript, asi que la pagina (que se pinta en el
 * navegador) no le sirve.
 *
 * Solo la dan los snapshots publicos vigentes. De uno de equipo el backend
 * responde 404 y aqui se usa una tarjeta generica: ni su titulo debe salir.
 */
export type SnapshotPreview = {
  kind: SnapshotKind;
  title: string;
  redacted: boolean;
  createdAt: string;
  expiresAt: string | null;
  stats: {
    records?: number;
    errors?: number;
    warnings?: number;
    groups?: number;
    occurrences?: number;
    applications?: number;
    durationMs?: number;
  };
};

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Donde llama el servidor de Next a la API. Detras de Caddy (mismo dominio)
 * `NEXT_PUBLIC_API_URL` va vacia y el servidor no puede usar una ruta relativa:
 * para eso esta `API_INTERNAL_URL` (p. ej. `http://api:3000` en Compose), que
 * se lee al arrancar y no hace falta reconstruir para cambiarla.
 */
export const serverApiBase = () => (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/** La vista previa, o null si no hay (de equipo, caducado, inexistente o API sin configurar). Nunca lanza. */
export const fetchSnapshotPreview = async (token: string): Promise<SnapshotPreview | null> => {
  const base = serverApiBase();
  if (!base || !TOKEN.test(token)) return null;
  try {
    const res = await fetch(`${base}/api/share/${token}/preview`, {
      cache: "no-store",
      // Un robot de vista previa no espera mucho: mejor la tarjeta generica que ninguna.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data: SnapshotPreview }).data;
  } catch {
    return null;
  }
};

/** Una linea con las cifras que mas dicen de cada tipo. */
export const describePreviewStats = (preview: SnapshotPreview, t: Dictionary, fmt: Formatter): string => {
  const { stats } = preview;
  const n = (value?: number) => fmt.number(value ?? 0);
  if (preview.kind === "errors") return t.sharePreview.errors(n(stats.groups), n(stats.occurrences));
  if (preview.kind === "trace") {
    return t.sharePreview.trace(n(stats.records), n(stats.applications), fmt.duration(stats.durationMs ?? 0), n(stats.errors));
  }
  return t.sharePreview.logs(n(stats.records), n(stats.errors), n(stats.warnings));
};

/** La descripcion completa: cifras, cuando se capturo y si va enmascarado. */
export const describePreview = (preview: SnapshotPreview, t: Dictionary, fmt: Formatter): string =>
  [
    describePreviewStats(preview, t, fmt),
    t.sharePreview.captured(fmt.date(preview.createdAt)),
    preview.redacted ? t.sharePreview.redacted : null,
  ]
    .filter(Boolean)
    .join(" · ");
