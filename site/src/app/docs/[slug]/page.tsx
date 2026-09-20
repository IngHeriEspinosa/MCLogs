import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsSidebar } from "@/components/DocsSidebar";
import { DocsToc } from "@/components/DocsToc";
import { DOCS, getDoc, getDocMeta } from "@/lib/docs";

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
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                {doc.title}
              </h1>
              <p className="mt-3 text-lg leading-8 text-slate-600">{doc.description}</p>
            </header>

            {/* El HTML sale de los .md del propio repositorio, no de entrada de
                usuario: el riesgo de inyeccion es el de cualquier commit. */}
            <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />

            <footer className="mt-16 border-t border-slate-200 pt-6">
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
