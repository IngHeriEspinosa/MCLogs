import { ImageResponse } from "next/og";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/common/i18n/config";
import { dictionaries } from "@/common/i18n/dictionaries";
import { createFormatter } from "@/common/i18n/format";
import { describePreviewStats, fetchSnapshotPreview } from "@/common/snapshots/preview";

// Edge y no Node: en Node, next/og resuelve mal la ruta de su fuente en Windows
// y la imagen falla en desarrollo. En edge carga la fuente empaquetada, y sigue
// leyendo API_INTERNAL_URL al arrancar (el sandbox copia process.env).
export const runtime = "edge";
export const alt = "MCLog snapshot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const requestLocale = (): Locale => {
  const stored = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(stored) ? stored : localeFromAcceptLanguage(headers().get("accept-language"));
};

// Los colores del panel (tema oscuro): la tarjeta se reconoce como MCLog en el chat.
const COLORS = {
  canvas: "#081116",
  surface: "#0f1c23",
  line: "#1f3440",
  ink: "#e8f0f3",
  ink2: "#a9bcc5",
  ink3: "#7b909a",
  brand: "#2b8fb8",
  accent: "#f2b233",
  error: "#e05252",
};

/**
 * La imagen de la vista previa del enlace: titulo, tipo y las cifras que mas
 * dicen. Sin JavaScript en el navegador y sin fuentes externas (usa la que trae
 * next/og). De un snapshot de equipo o desconocido, una tarjeta generica.
 */
export default async function Image({ params }: { params: { token: string } }) {
  const locale = requestLocale();
  const t = dictionaries[locale];
  const fmt = createFormatter(locale);
  const preview = await fetchSnapshotPreview(params.token);

  const kicker = preview ? `${t.snapshots.viewer.badge} · ${t.snapshots.kinds[preview.kind]}` : t.snapshots.viewer.badge;
  const title = preview?.title ?? t.sharePreview.genericTitle;
  const stats = preview ? describePreviewStats(preview, t, fmt) : t.sharePreview.genericDescription;
  const footer = preview
    ? [t.sharePreview.captured(fmt.date(preview.createdAt)), preview.redacted ? t.sharePreview.redacted : null].filter(Boolean).join(" · ")
    : "";
  const hasErrors = Boolean(preview && ((preview.stats.errors ?? 0) > 0 || preview.kind === "errors"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: COLORS.canvas,
          color: COLORS.ink,
          borderTop: `8px solid ${hasErrors ? COLORS.error : COLORS.brand}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: COLORS.brand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            M
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700 }}>MCLog</div>
            <div style={{ fontSize: 20, color: COLORS.accent, letterSpacing: 3, textTransform: "uppercase" }}>{kicker}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: title.length > 60 ? 52 : 64,
              fontWeight: 700,
              lineHeight: 1.1,
              display: "flex",
              maxHeight: 150,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: COLORS.ink2,
              padding: "16px 24px",
              borderRadius: 16,
              background: COLORS.surface,
              border: `2px solid ${COLORS.line}`,
              alignSelf: "flex-start",
            }}
          >
            {stats}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: COLORS.ink3 }}>{footer}</div>
      </div>
    ),
    size,
  );
}
