import fs from "node:fs";
import path from "node:path";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import { BASE_PATH, GITHUB_REPO } from "./site";

/**
 * La documentacion no se duplica aqui: se lee de `docs/` en la raiz del
 * repositorio y se convierte a HTML durante el build. Editar un .md y publicar
 * es todo lo que hace falta para actualizar el sitio.
 */
const DOCS_DIR = path.join(process.cwd(), "..", "docs");

export type DocGroup = "empezar" | "integrar" | "operar" | "referencia";

export interface DocMeta {
  slug: string;
  file: string;
  title: string;
  description: string;
  group: DocGroup;
}

export const DOC_GROUPS: { id: DocGroup; label: string }[] = [
  { id: "empezar", label: "Empezar" },
  { id: "integrar", label: "Integrar" },
  { id: "operar", label: "Desplegar y operar" },
  { id: "referencia", label: "Referencia" },
];

/**
 * Orden y textos curados: el indice de la web no tiene por que seguir el orden
 * alfabetico del directorio.
 */
export const DOCS: DocMeta[] = [
  {
    slug: "funcionalidades",
    file: "FEATURES.md",
    title: "Funcionalidades",
    description: "Qué hace el sistema, funcionalidad por funcionalidad: quién la usa y cómo se usa.",
    group: "empezar",
  },
  {
    slug: "manual-de-usuario",
    file: "USER_GUIDE.md",
    title: "Manual de usuario",
    description: "Consultar logs en el dashboard, enviarlos desde tus apps y administrar el servicio.",
    group: "empezar",
  },
  {
    slug: "integracion",
    file: "INTEGRATION.md",
    title: "Integración (API REST)",
    description: "Contrato de ingesta y ejemplos en curl, Node.js, Python y NetSuite.",
    group: "integrar",
  },
  {
    slug: "integracion-ia",
    file: "AI_INTEGRATION.md",
    title: "Conectar una IA (MCP)",
    description: "Que Claude Code, Cursor o Claude Desktop investiguen tus logs por su cuenta.",
    group: "integrar",
  },
  {
    slug: "despliegue",
    file: "DEPLOYMENT.md",
    title: "Despliegue en producción",
    description: "VPS con Docker Compose y Caddy, HTTPS automático y copias de seguridad.",
    group: "operar",
  },
  {
    slug: "arquitectura",
    file: "ARCHITECTURE.md",
    title: "Arquitectura",
    description: "Flujo de datos, decisiones de diseño y ruta de escalabilidad.",
    group: "operar",
  },
  {
    slug: "tecnica",
    file: "TECHNICAL.md",
    title: "Documentación técnica",
    description: "Modelo de datos, referencia de la API, seguridad y configuración.",
    group: "referencia",
  },
  {
    slug: "faq",
    file: "FAQ.md",
    title: "Preguntas frecuentes",
    description: "Errores concretos con su solución y las dudas que más se repiten.",
    group: "referencia",
  },
  {
    slug: "glosario",
    file: "GLOSSARY.md",
    title: "Glosario",
    description: "Todos los términos del proyecto, ordenados alfabéticamente.",
    group: "referencia",
  },
];

/** Nombre de fichero .md -> ruta publica, para reescribir enlaces entre documentos. */
const FILE_TO_SLUG = new Map(DOCS.map((d) => [d.file, d.slug]));

export const getDocMeta = (slug: string) => DOCS.find((d) => d.slug === slug);

/**
 * Misma normalizacion que usa GitHub para los anclajes de encabezado. Se imita
 * a proposito: los .md ya enlazan entre si con anclas como
 * `USER_GUIDE.md#parte-a--consultar-logs-dashboard`, y si el slug no coincide
 * esos enlaces se rompen en la web.
 */
const slugifyHeading = (text: string) =>
  text
    .replace(/<[^>]*>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

/**
 * Traduce un enlace del .md a su equivalente en la web.
 *
 * - `FAQ.md#algo`       -> `/docs/faq#algo`        (documento publicado)
 * - `../packages/...`   -> fichero en GitHub       (fuera de docs/)
 * - `#algo`, `http...`  -> se dejan como estan
 */
const rewriteHref = (href: string): string => {
  if (!href) return href;
  if (/^(https?:|mailto:|#)/i.test(href)) return href;

  const [target, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";

  const slug = FILE_TO_SLUG.get(path.posix.basename(target));
  // BASE_PATH se antepone a mano: `next/link` lo hace solo, pero estos enlaces
  // salen como HTML crudo del Markdown y Next no los toca.
  if (slug) return `${BASE_PATH}/docs/${slug}/${anchor}`;

  // Un .md de docs/ que no se publica en la web (README.md es el indice).
  if (path.posix.basename(target) === "README.md" && !target.includes("..")) {
    return `${BASE_PATH}/docs/${anchor}`;
  }

  // Cualquier otra ruta relativa apunta a codigo del repositorio.
  const repoPath = path.posix.normalize(path.posix.join("docs", target));
  return `${GITHUB_REPO}/blob/main/${repoPath}${anchor}`;
};

const createRenderer = () => {
  const marked = new Marked(
    markedHighlight({
      langPrefix: "hljs language-",
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : "plaintext";
        return hljs.highlight(code, { language }).value;
      },
    })
  );

  // Un mismo texto de encabezado puede repetirse dentro de un documento; el
  // contador replica el sufijo -1, -2 que anade GitHub.
  const seen = new Map<string, number>();
  const headings: DocHeading[] = [];

  marked.use({
    renderer: {
      heading(text: string, level: number) {
        const base = slugifyHeading(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;

        if (level === 2 || level === 3) {
          headings.push({ id, level, text: text.replace(/<[^>]*>/g, "") });
        }
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>\n`;
      },
      link(href: string, title: string | null | undefined, text: string) {
        const url = rewriteHref(href);
        const external = /^https?:/i.test(url);
        const attrs = [
          `href="${url}"`,
          title ? `title="${title}"` : "",
          external ? 'target="_blank" rel="noopener noreferrer"' : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<a ${attrs}>${text}</a>`;
      },
      table(header: string, body: string) {
        // El contenedor permite hacer scroll lateral en movil sin romper la pagina.
        return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });

  return { marked, headings };
};

export interface DocHeading {
  id: string;
  level: number;
  text: string;
}

export interface RenderedDoc extends DocMeta {
  html: string;
  headings: DocHeading[];
  githubUrl: string;
}

export function getDoc(slug: string): RenderedDoc | null {
  const meta = getDocMeta(slug);
  if (!meta) return null;

  const raw = fs.readFileSync(path.join(DOCS_DIR, meta.file), "utf8");

  // El H1 del .md se muestra como cabecera de la pagina, asi que se quita del
  // cuerpo para no repetirlo.
  const body = raw.replace(/^#\s+.*\r?\n/, "");

  const { marked, headings } = createRenderer();
  const html = marked.parse(body) as string;

  return {
    ...meta,
    html,
    headings,
    githubUrl: `${GITHUB_REPO}/blob/main/docs/${meta.file}`,
  };
}

/** Fecha de la ultima modificacion del .md, para el sitemap. */
export function getDocLastModified(file: string): Date {
  try {
    return fs.statSync(path.join(DOCS_DIR, file)).mtime;
  } catch {
    return new Date();
  }
}
