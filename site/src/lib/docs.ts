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

export type DocGroup = "guias" | "empezar" | "integrar" | "operar" | "referencia";

export interface DocMeta {
  slug: string;
  /** Ruta del .md relativa a `docs/`, con barras normales (`guias/primeros-pasos.md`). */
  file: string;
  title: string;
  description: string;
  group: DocGroup;
}

export const DOC_GROUPS: { id: DocGroup; label: string }[] = [
  { id: "guias", label: "Guías paso a paso" },
  { id: "empezar", label: "Empezar" },
  { id: "integrar", label: "Integrar" },
  { id: "operar", label: "Desplegar y operar" },
  { id: "referencia", label: "Referencia" },
];

/**
 * Orden y textos curados: el indice de la web no tiene por que seguir el orden
 * alfabetico del directorio. El orden de las guias es tambien el de la
 * navegacion anterior/siguiente, asi que va del primer contacto a la operacion.
 */
export const DOCS: DocMeta[] = [
  {
    slug: "primeros-pasos",
    file: "guias/primeros-pasos.md",
    title: "Primeros pasos",
    description: "Instala MCLog en tu equipo, entra, crea una API key y envía tu primer log.",
    group: "guias",
  },
  {
    slug: "probar-con-el-lab",
    file: "guias/probar-con-el-lab.md",
    title: "Probar con el Lab",
    description: "Escenarios de prueba que envían logs reales para ver cada pantalla en acción.",
    group: "guias",
  },
  {
    slug: "presentar-una-demo",
    file: "guias/presentar-una-demo.md",
    title: "Presentar MCLog: guion de una demo",
    description: "25 minutos para enseñar MCLog a tu equipo: preparación, qué pulsar, qué decir y qué hacer si algo falla.",
    group: "guias",
  },
  {
    slug: "investigar-un-incidente",
    file: "guias/investigar-incidente.md",
    title: "Investigar un incidente",
    description: "Del aviso a la causa: errores agrupados, ocurrencias, traza, contexto y brief para IA.",
    group: "guias",
  },
  {
    slug: "buscar-registros",
    file: "guias/buscar-registros.md",
    title: "Buscar registros",
    description: "Filtros, búsqueda avanzada campo por campo, compartir la vista y exportar.",
    group: "guias",
  },
  {
    slug: "compartir-un-snapshot",
    file: "guias/compartir-snapshots.md",
    title: "Compartir un snapshot",
    description: "Un enlace a una copia congelada de Logs, Errores o una Traza, para tu equipo o público con los datos enmascarados.",
    group: "guias",
  },
  {
    slug: "proteger-tu-cuenta",
    file: "guias/seguridad-cuenta.md",
    title: "Proteger tu cuenta",
    description: "Contraseña, verificación en dos pasos, códigos de recuperación y eliminar la cuenta.",
    group: "guias",
  },
  {
    slug: "integrar-node",
    file: "guias/integrar-node.md",
    title: "Integrar una aplicación Node.js",
    description: "Logs y excepciones agrupables desde Node con la librería oficial.",
    group: "guias",
  },
  {
    slug: "integrar-netsuite",
    file: "guias/integrar-netsuite.md",
    title: "Integrar NetSuite",
    description: "Cliente SuiteScript 2.1 en el File Cabinet, User Events y Map/Reduce.",
    group: "guias",
  },
  {
    slug: "integrar-netsuite-lib-mclog",
    file: "guias/integrar-netsuite-lib-mclog.md",
    title: "Integrar NetSuite con lib_mclog.js",
    description: "Librería central descargable: configuración en un registro, un envío por ejecución y errores no controlados registrados solos.",
    group: "guias",
  },
  {
    slug: "conectar-una-ia",
    file: "guias/conectar-ia.md",
    title: "Conectar una IA",
    description: "Clave de lectura y configuración MCP para Claude Code, Cursor, VS Code o Claude Desktop.",
    group: "guias",
  },
  {
    slug: "administrar-usuarios-y-claves",
    file: "guias/administrar-usuarios-y-claves.md",
    title: "Administrar espacios, usuarios y claves",
    description: "Espacios de trabajo, invitaciones, roles, cuenta root, API keys con permisos y rotación sin cortes.",
    group: "guias",
  },
  {
    slug: "configurar-alertas",
    file: "guias/configurar-alertas.md",
    title: "Configurar alertas",
    description: "Canales por webhook, correo o Telegram, reglas de umbral o de error nuevo, y cómo probarlas.",
    group: "guias",
  },
  {
    slug: "desplegar-en-un-vps",
    file: "guias/desplegar-vps.md",
    title: "Desplegar en un VPS",
    description: "Producción con Docker Compose y Caddy: de cero a HTTPS con copias diarias.",
    group: "guias",
  },
  {
    slug: "desplegar-en-caprover-y-railway",
    file: "guias/desplegar-caprover-railway.md",
    title: "Desplegar en CapRover y Railway",
    description: "API y base de datos en CapRover, dashboard en Railway, sesiones entre dominios.",
    group: "guias",
  },
  {
    slug: "copias-y-mantenimiento",
    file: "guias/copias-y-mantenimiento.md",
    title: "Copias y mantenimiento",
    description: "Retención, copias de seguridad, restauración y actualizaciones.",
    group: "guias",
  },
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
    description: "VPS con Docker Compose y Caddy, o CapRover + Railway; copias de seguridad y escalado.",
    group: "operar",
  },
  {
    slug: "arquitectura",
    file: "ARCHITECTURE.md",
    title: "Arquitectura",
    description: "Flujo de datos, topologías de despliegue, decisiones de diseño y escalabilidad.",
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

/** Ruta del .md relativa a `docs/` -> ruta publica, para reescribir enlaces entre documentos. */
const FILE_TO_SLUG = new Map(DOCS.map((d) => [d.file, d.slug]));

export const getDocMeta = (slug: string) => DOCS.find((d) => d.slug === slug);

/**
 * Documentos vecinos en el orden de `DOCS`, para seguir leyendo sin volver al
 * indice. Solo dentro del mismo grupo: saltar de la ultima guia al manual de
 * usuario no es "el siguiente paso" de nada.
 */
export function getAdjacentDocs(slug: string): { prev?: DocMeta; next?: DocMeta } {
  const doc = getDocMeta(slug);
  if (!doc) return {};
  const siblings = DOCS.filter((d) => d.group === doc.group);
  const index = siblings.findIndex((d) => d.slug === slug);
  return { prev: siblings[index - 1], next: siblings[index + 1] };
}

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
 * Ancla de cada grupo en el indice /docs. Coincide con la del encabezado del
 * mismo nombre en docs/README.md, asi que `README.md#guías-paso-a-paso` funciona
 * igual en GitHub que en la web.
 */
export const groupAnchor = (label: string) => slugifyHeading(label);

/**
 * Traduce un enlace del .md a su equivalente en la web. La ruta se resuelve
 * desde la carpeta del documento que la contiene, igual que en GitHub: desde
 * `guias/x.md`, `../FAQ.md` es `FAQ.md` y `../../packages/...` sale del repo.
 *
 * - `FAQ.md#algo`        -> `/docs/faq#algo`      (documento publicado)
 * - `README.md`          -> `/docs`               (el indice)
 * - `../packages/...`    -> fichero en GitHub     (fuera de docs/ o no publicado)
 * - `#algo`, `http...`   -> se dejan como estan
 */
const rewriteHref = (href: string, fromFile: string): string => {
  if (!href) return href;
  if (/^(https?:|mailto:|#)/i.test(href)) return href;

  const [target, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  // Relativa a docs/. Puede empezar por ../ si apunta fuera de la carpeta.
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), target));

  const slug = FILE_TO_SLUG.get(resolved);
  // BASE_PATH se antepone a mano: `next/link` lo hace solo, pero estos enlaces
  // salen como HTML crudo del Markdown y Next no los toca.
  if (slug) return `${BASE_PATH}/docs/${slug}/${anchor}`;

  // docs/README.md no se publica tal cual: su papel lo hace el indice /docs.
  if (resolved === "README.md") return `${BASE_PATH}/docs/${anchor}`;

  // Cualquier otra ruta relativa apunta a codigo o ficheros del repositorio.
  const repoPath = path.posix.normalize(path.posix.join("docs", resolved));
  const isFolder = target.endsWith("/");
  return `${GITHUB_REPO}/${isFolder ? "tree" : "blob"}/main/${repoPath.replace(/\/$/, "")}${anchor}`;
};

/**
 * Avisos al estilo de GitHub: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`,
 * `> [!WARNING]` y `> [!CAUTION]`. Se usa la misma sintaxis para que el .md
 * se vea igual de bien en el repositorio que en la web.
 */
const CALLOUTS: Record<string, { label: string; icon: string }> = {
  note: { label: "Nota", icon: "i" },
  tip: { label: "Consejo", icon: "✓" },
  important: { label: "Importante", icon: "!" },
  warning: { label: "Atención", icon: "!" },
  caution: { label: "Cuidado", icon: "×" },
};

const CALLOUT_MARKER = /^\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

const renderBlockquote = (quote: string): string => {
  const match = quote.match(CALLOUT_MARKER);
  if (!match) return `<blockquote>\n${quote}</blockquote>\n`;

  const kind = match[1].toLowerCase();
  const { label, icon } = CALLOUTS[kind];
  // El marcador va solo en su linea: si el primer parrafo queda vacio, se quita.
  const body = `<p>${quote.slice(match[0].length)}`.replace(/^<p>\s*<\/p>\s*/, "");

  return (
    `<div class="callout callout-${kind}" role="note">` +
    `<p class="callout-title"><span class="callout-icon" aria-hidden="true">${icon}</span>${label}</p>` +
    `${body}</div>\n`
  );
};

const createRenderer = (fromFile: string) => {
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

        // Los H1 dentro del cuerpo (las "Partes" del manual) tambien entran
        // en el indice lateral: son las secciones mas grandes del documento.
        if (level <= 3) {
          headings.push({ id, level, text: text.replace(/<[^>]*>/g, "") });
        }
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>\n`;
      },
      link(href: string, title: string | null | undefined, text: string) {
        const url = rewriteHref(href, fromFile);
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
      image(href: string, title: string | null, text: string) {
        // Una imagen relativa vive en el repositorio: se sirve desde GitHub en
        // crudo, porque site/public no copia nada de docs/.
        const resolved = path.posix.normalize(path.posix.join("docs", path.posix.dirname(fromFile), href));
        const src = /^https?:/i.test(href) ? href : `${GITHUB_REPO}/raw/main/${resolved}`;
        return `<img src="${src}" alt="${text}"${title ? ` title="${title}"` : ""} loading="lazy" />`;
      },
      blockquote: renderBlockquote,
      list(body: string, ordered: boolean, start: number | "") {
        if (!ordered) return `<ul>\n${body}</ul>\n`;
        // Las listas numeradas se pintan como pasos con un contador CSS, que
        // tiene que arrancar donde diga el Markdown (una lista que sigue a un
        // bloque de codigo empieza en 2, 3…).
        const first = typeof start === "number" ? start : 1;
        const startAttr = first !== 1 ? ` start="${first}"` : "";
        return `<ol${startAttr} style="counter-reset: step ${first - 1}">\n${body}</ol>\n`;
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

  const { marked, headings } = createRenderer(meta.file);
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
