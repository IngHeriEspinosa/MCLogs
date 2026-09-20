import Link from "next/link";
import { DOCS, DOC_GROUPS } from "@/lib/docs";

export function DocsSidebar({ current }: { current: string }) {
  return (
    <nav aria-label="Documentación" className="space-y-6">
      <Link href="/docs" className="block text-sm font-medium text-slate-600 hover:text-primary-600">
        ← Índice de documentación
      </Link>

      {DOC_GROUPS.map((group) => {
        const docs = DOCS.filter((doc) => doc.group === group.id);
        if (docs.length === 0) return null;

        return (
          <div key={group.id}>
            <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </h2>
            <ul className="mt-2 space-y-1 border-l border-slate-200">
              {docs.map((doc) => {
                const active = doc.slug === current;
                return (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${doc.slug}`}
                      aria-current={active ? "page" : undefined}
                      className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ${
                        active
                          ? "border-primary-600 font-medium text-primary-700"
                          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      {doc.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
