import Link from "next/link";
import { GitHubIcon } from "@/components/Brand";
import { GITHUB_REPO } from "@/lib/site";

export function Privacy() {
  return (
    <section className="border-t border-slate-200 bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tus logs no pasan por nosotros
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              MCLog no es un servicio alojado: es software que instalas en tu propia máquina. No hay
              servidor central al que reporte, ni telemetría, ni cuenta que crear. Los logs entran
              en tu PostgreSQL y se borran según la retención que tú configures.
            </p>

            <ul className="mt-8 space-y-3 text-slate-300">
              {[
                "Sin telemetría ni llamadas a terceros desde tu instancia.",
                "Sin cuentas, sin suscripción y sin coste por volumen.",
                "Código completo y auditable bajo licencia MIT.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <svg viewBox="0 0 20 20" className="mt-1 h-4 w-4 flex-none text-primary-400" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm leading-6">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-4 text-sm font-medium">
              <Link href="/legal/privacidad" className="text-primary-300 hover:text-primary-200">
                Nota de privacidad →
              </Link>
              <Link href="/legal/licencia" className="text-primary-300 hover:text-primary-200">
                Qué permite la licencia MIT →
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8">
            <h3 className="font-heading text-xl font-semibold text-white">Empieza en diez minutos</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Clona el repositorio, levanta la base de datos y el backend, y abre el dashboard. La
              documentación cubre desde el primer log hasta el despliegue en un VPS con HTTPS.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/docs"
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-500"
              >
                Ir a la documentación
              </Link>
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700"
              >
                <GitHubIcon className="h-4 w-4" />
                Clonar el repositorio
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
