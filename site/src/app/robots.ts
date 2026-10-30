import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Con `output: export`, Next 16 exige declarar estatica cada ruta de metadatos.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
