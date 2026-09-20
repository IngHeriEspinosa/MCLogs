import type { MetadataRoute } from "next";
import { DOCS, getDocLastModified } from "@/lib/docs";
import { SITE_URL } from "@/lib/site";

// `trailingSlash: true` hace que cada ruta se sirva como carpeta/index.html,
// asi que el sitemap declara esa misma forma y no una redireccion.
const url = (path: string) => `${SITE_URL}${path}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: url("/"), lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: url("/docs/"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...DOCS.map((doc) => ({
      url: url(`/docs/${doc.slug}/`),
      lastModified: getDocLastModified(doc.file),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: url("/legal/privacidad/"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/legal/licencia/"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
