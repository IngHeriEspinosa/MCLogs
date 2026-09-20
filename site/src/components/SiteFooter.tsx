import Link from "next/link";
import { DOCS, DOC_GROUPS } from "@/lib/docs";
import { GITHUB_REPO, NPM_PACKAGE, NPM_URL, repoFile } from "@/lib/site";
import { GitHubIcon, Logo } from "./Brand";

const YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
            <Logo className="h-7 w-7" />
            MCLog
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Servicio de logs centralizados, open source y autoalojado. Tus logs se quedan en tu
            servidor.
          </p>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-primary-600"
          >
            <GitHubIcon className="h-4 w-4" />
            IngHeriEspinosa/MCLogs
          </a>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold text-slate-900">Documentación</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {DOC_GROUPS.slice(0, 2).flatMap((group) =>
              DOCS.filter((doc) => doc.group === group.id).map((doc) => (
                <li key={doc.slug}>
                  <Link href={`/docs/${doc.slug}`} className="text-slate-600 hover:text-primary-600">
                    {doc.title}
                  </Link>
                </li>
              ))
            )}
            <li>
              <Link href="/docs" className="font-medium text-slate-700 hover:text-primary-600">
                Ver toda la documentación →
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold text-slate-900">Proyecto</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-primary-600">
                Código en GitHub
              </a>
            </li>
            <li>
              <a href={`${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-primary-600">
                Reportar un problema
              </a>
            </li>
            <li>
              <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-primary-600">
                {NPM_PACKAGE} en npm
              </a>
            </li>
            <li>
              <a href={repoFile("integrations/netsuite/README.md")} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-primary-600">
                Librería para NetSuite
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold text-slate-900">Legal y seguridad</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/legal/privacidad" className="text-slate-600 hover:text-primary-600">
                Privacidad
              </Link>
            </li>
            <li>
              <Link href="/legal/licencia" className="text-slate-600 hover:text-primary-600">
                Licencia MIT
              </Link>
            </li>
            <li>
              <a href={repoFile("SECURITY.md")} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-primary-600">
                Política de seguridad
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 sm:px-6">
          © {YEAR} Heri Espinosa · Publicado bajo licencia MIT. MCLog se instala en tu propia
          infraestructura; este sitio solo publica su documentación.
        </p>
      </div>
    </footer>
  );
}
