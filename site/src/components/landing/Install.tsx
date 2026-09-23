import Link from "next/link";
import { highlightCode } from "@/lib/highlight";
import { GITHUB_REPO, NPM_PACKAGE, NPM_URL } from "@/lib/site";

/** Mismo arranque rapido que el README del repositorio. */
const QUICKSTART = `git clone https://github.com/IngHeriEspinosa/MCLogs.git
cd MCLogs

# 1. Base de datos (PostgreSQL en el puerto 5435)
cd Back_MCLog && docker compose up -d db

# 2. Backend (puerto 3000)
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev

# 3. Dashboard (puerto 3001)
cd ../frontend_mclog && npm install && npm run dev`;

const STEPS = [
  {
    title: "Levántalo",
    body: "Requiere Node.js 20+ y Docker. En local son tres comandos; en producción, un docker compose up con Caddy resolviendo el HTTPS por su cuenta, o CapRover y Railway.",
  },
  {
    title: "Crea una API key",
    body: "Desde Espacio → API keys del dashboard, con permiso de solo ingesta y acotada a una aplicación. Una clave por emisor.",
  },
  {
    title: "Manda tu primer log",
    body: "Instala la librería npm, copia el cliente de SuiteScript o haz un POST directo. A los pocos segundos está en el dashboard.",
  },
];

export function Install() {
  const html = highlightCode(QUICKSTART, "bash");

  return (
    <section id="instalacion" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 className="section-title font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Instalación
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            No hay que registrarse en ningún sitio ni pedir una clave: se clona, se levanta y ya es
            tuyo.
          </p>

          <ol className="mt-8 space-y-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-400 font-heading text-sm font-bold text-slate-900">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-heading font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap gap-4 text-sm font-medium">
            <Link href="/docs/primeros-pasos" className="text-primary-600 hover:text-primary-700">
              Guía paso a paso: primeros pasos →
            </Link>
            <Link href="/docs/despliegue" className="text-primary-600 hover:text-primary-700">
              Guía de despliegue en producción →
            </Link>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700"
            >
              Código en GitHub →
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700"
            >
              {NPM_PACKAGE} en npm →
            </a>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800/60 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-400" aria-hidden="true" />
            <span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="h-3 w-3 rounded-full bg-green-400" aria-hidden="true" />
            <span className="ml-2 font-mono text-xs text-slate-400">arranque local</span>
          </div>
          <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
            <code className="hljs font-mono" dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
      </div>
    </section>
  );
}
