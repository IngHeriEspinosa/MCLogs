import { ImageResponse } from "next/og";

// Edge por lo mismo que las imagenes Open Graph: en Node, next/og no encuentra
// su fuente en Windows y la imagen falla en desarrollo.
export const runtime = "edge";

/** Los colores del isotipo de icon.svg. */
const COLORS = { mark: "#19607e", accent: "#ebae23" };

/**
 * Iconos PNG de la PWA, dibujados con el isotipo de icon.svg: 192 y 512 px, y
 * "maskable" (512 px con margen de seguridad, para los lanzadores que recortan
 * el icono en circulo o en gota). Cualquier otro tamano responde 404.
 */
export function GET(_request: Request, { params }: { params: { size: string } }) {
  const maskable = params.size === "maskable";
  const size = maskable ? 512 : Number(params.size);
  if (size !== 192 && size !== 512) return new Response("Not found", { status: 404 });

  // El maskable ocupa el 80 % central: lo que queda fuera puede recortarse.
  const mark = maskable ? size * 0.8 : size;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.mark }}>
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          {!maskable && <rect width="32" height="32" rx="8" fill={COLORS.mark} />}
          <path d="M9 21V11l4 6 4-6v10" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="23" cy="19.5" r="2" fill={COLORS.accent} />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
