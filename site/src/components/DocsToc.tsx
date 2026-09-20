import type { DocHeading } from "@/lib/docs";

/** Indice del documento. Solo se muestra si hay suficientes secciones. */
export function DocsToc({ headings }: { headings: DocHeading[] }) {
  if (headings.length < 3) return null;

  return (
    <nav aria-label="En esta página" className="text-sm">
      <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
        En esta página
      </h2>
      <ul className="mt-3 space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "pl-4" : undefined}>
            <a
              href={`#${heading.id}`}
              className="block text-slate-600 transition-colors hover:text-primary-600"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
