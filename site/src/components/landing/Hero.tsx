import Link from "next/link";
import { GitHubIcon } from "@/components/Brand";
import { GITHUB_REPO } from "@/lib/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-primary-50 via-white to-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1 text-sm font-medium text-primary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
            Open source · Licencia MIT · Autoalojado
          </p>

          <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Los logs de todas tus aplicaciones,{" "}
            <span className="text-primary-600">en un solo sitio</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            MCLog captura, agrupa y deja consultar los logs de tus servicios Node.js, tus scripts de
            NetSuite, tus procesos en Python o de cualquier sistema capaz de hacer una petición
            HTTP. Se instala en tu propio servidor: tus logs nunca salen de tu infraestructura.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs"
              className="w-full rounded-lg bg-primary-600 px-6 py-3 text-center font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 sm:w-auto"
            >
              Leer la documentación
            </Link>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
            >
              <GitHubIcon className="h-5 w-5" />
              Ver en GitHub
            </a>
          </div>

          <p className="mt-6 text-sm text-slate-500">
            Sin cuentas, sin planes, sin coste por log. Lo levantas con Docker Compose y es tuyo.
          </p>
        </div>
      </div>
    </section>
  );
}
