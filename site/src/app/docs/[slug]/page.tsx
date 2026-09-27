import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsSidebar } from "@/components/DocsSidebar";
import { DocsToc } from "@/components/DocsToc";
import Link from "next/link";
import { DOCS, DOC_GROUPS, getAdjacentDocs, getDoc, getDocMeta } from "@/lib/docs";
import { asset } from "@/lib/site";

interface PageProps {
  params: { slug: string };
}

/** Con output: export, esto fija las paginas que se generan en el build. */
export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const meta = getDocMeta(params.slug);
  if (!meta) return {};

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `/docs/${meta.slug}` },
    openGraph: {
      type: "article",
      title: `${meta.title} · MCLog`,
      description: meta.description,
    },
  };
}

export default function DocPage({ params }: PageProps) {
  const doc = getDoc(params.slug);
  if (!doc) notFound();

  const { prev, next } = getAdjacentDocs(doc.slug);
  const groupLabel = DOC_GROUPS.find((group) => group.id === doc.group)?.label;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
            <DocsSidebar current={doc.slug} />
          </div>
        </aside>

        <div className="min-w-0 xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-10">
          <article className="min-w-0">
            <header className="border-b border-slate-200 pb-6">
              {groupLabel && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-700">{groupLabel}</p>
              )}
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                {doc.title}
              </h1>
              <p className="mt-3 text-lg leading-8 text-slate-600">{doc.description}</p>
              {doc.download && (
                <a
                  href={asset(doc.download)}
                  download
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5 5 5-5M12 15V3" />
                  </svg>
                  Descargar .md
                </a>
              )}
            </header>

            {/* El HTML sale de los .md del propio repositorio, no de entrada de
                usuario: el riesgo de inyeccion es el de cualquier commit. */}
            <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />

            {(prev || next) && (
              <nav aria-label="Seguir leyendo" className="mt-16 grid gap-4 sm:grid-cols-2">
                {prev ? (
                  <Link
                    href={`/docs/${prev.slug}`}
                    className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                  >
                    <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">← Anterior</span>
                    <span className="mt-1 block font-medium text-primary-700">{prev.title}</span>
                  </Link>
                ) : (
                  <span className="hidden sm:block" />
                )}
                {next && (
                  <Link
                    href={`/docs/${next.slug}`}
                    className="rounded-xl border border-slate-200 p-4 text-right transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                  >
                    <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Siguiente →</span>
                    <span className="mt-1 block font-medium text-primary-700">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            <footer className="mt-10 border-t border-slate-200 pt-6">
              <a
                href={doc.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                ¿Ves algo mal? Edita esta página en GitHub →
              </a>
            </footer>
          </article>

          <aside className="hidden xl:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
              <DocsToc headings={doc.headings} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
