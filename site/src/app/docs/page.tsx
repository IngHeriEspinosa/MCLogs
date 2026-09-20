import type { Metadata } from "next";
import Link from "next/link";
import { DOCS, DOC_GROUPS } from "@/lib/docs";
import { GITHUB_REPO, NPM_PACKAGE, NPM_URL, repoFile } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentación",
  description:
    "Toda la documentación de MCLog: funcionalidades, manual de usuario, integración por API REST, conexión con asistentes de IA, despliegue, arquitectura y referencia técnica.",
  alternates: { canonical: "/docs" },
};

/** Atajos por perfil, equivalentes a la tabla de entrada de docs/README.md. */
const SHORTCUTS = [
  { role: "Nuevo en el proyecto", href: "/docs/funcionalidades", label: "Funcionalidades" },
  { role: "Vas a usar el dashboard", href: "/docs/manual-de-usuario", label: "Manual de usuario" },
  { role: "Vas a integrar una app", href: "/docs/integracion", label: "Guía de integración" },
  { role: "Quieres conectar una IA", href: "/docs/integracion-ia", label: "Integración MCP" },
  { role: "Vas a desplegar", href: "/docs/despliegue", label: "Despliegue en producción" },
  { role: "Buscas una respuesta rápida", href: "/docs/faq", label: "Preguntas frecuentes" },
];

export default function DocsIndexPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900">
          Documentación
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Todo lo necesario para instalar MCLog, enviarle logs desde tus aplicaciones, investigarlos
          y mantener el servicio. Es la misma documentación que vive en el repositorio: si
          encuentras algo mal, puedes corregirlo con un pull request.
        </p>
      </header>

      <section className="mt-12 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="font-heading text-lg font-semibold text-slate-900">Empieza por aquí</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.href}>
              <Link
                href={shortcut.href}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
              >
                <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {shortcut.role}
                </span>
                <span className="mt-1 block font-medium text-primary-700">{shortcut.label} →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {DOC_GROUPS.map((group) => {
        const docs = DOCS.filter((doc) => doc.group === group.id);
        if (docs.length === 0) return null;

        return (
          <section key={group.id} className="mt-14">
            <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
              {group.label}
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {docs.map((doc) => (
                <Link
                  key={doc.slug}
                  href={`/docs/${doc.slug}`}
                  className="rounded-xl border border-slate-200 p-6 transition-shadow hover:shadow-md"
                >
                  <h3 className="font-heading text-lg font-semibold text-slate-900">{doc.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{doc.description}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <section className="mt-14 rounded-xl border border-slate-200 p-6">
        <h2 className="font-heading text-lg font-semibold text-slate-900">
          Referencias fuera de este sitio
        </h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>
            <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700">
              {NPM_PACKAGE} en npm
            </a>
            <span className="text-slate-600"> — librería para aplicaciones Node.js, con su referencia de opciones.</span>
          </li>
          <li>
            <a href={repoFile("integrations/netsuite/README.md")} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700">
              Cliente SuiteScript 2.1
            </a>
            <span className="text-slate-600"> — librería y ejemplos para NetSuite (User Event y Map/Reduce).</span>
          </li>
          <li>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700">
              Código fuente
            </a>
            <span className="text-slate-600"> — backend, dashboard, librerías y scripts de despliegue.</span>
          </li>
          <li>
            <span className="font-medium text-slate-900">Swagger UI</span>
            <span className="text-slate-600">
              {" "}— tu propia instancia publica la referencia ejecutable de la API en{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em]">/docs</code>.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
