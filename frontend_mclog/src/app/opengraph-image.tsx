import { ImageResponse } from "next/og";

// Edge por lo mismo que la de los snapshots: en Node, next/og no encuentra su
// fuente en Windows y la imagen falla en desarrollo.
export const runtime = "edge";
export const alt = "MCLog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Los colores del panel (tema oscuro) y los del isotipo de icon.svg.
const COLORS = {
  canvas: "#081116",
  ink: "#e8f0f3",
  ink2: "#a9bcc5",
  brand: "#2b8fb8",
  mark: "#19607e",
  accent: "#ebae23",
};

/**
 * Imagen de la vista previa de cualquier enlace al panel (login, restablecer
 * contraseña, una pagina interna…). Los robots de Teams, Slack o WhatsApp no
 * usan el favicon SVG: sin esto la tarjeta sale con un icono generico. Los
 * snapshots compartidos tienen la suya en `s/[token]`.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 96px",
          background: COLORS.canvas,
          color: COLORS.ink,
          borderTop: `8px solid ${COLORS.brand}`,
        }}
      >
        <svg width="220" height="220" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill={COLORS.mark} />
          <path
            d="M9 21V11l4 6 4-6v10"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23" cy="19.5" r="2" fill={COLORS.accent} />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>MCLog</div>
          <div style={{ fontSize: 34, color: COLORS.ink2 }}>Consola de logs centralizados</div>
          <div style={{ fontSize: 28, color: COLORS.accent, letterSpacing: 2 }}>Centralized log console</div>
        </div>
      </div>
    ),
    size,
  );
}
