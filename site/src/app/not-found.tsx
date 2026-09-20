import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-32 text-center sm:px-6">
      <p className="font-heading text-sm font-semibold uppercase tracking-wide text-primary-600">
        Error 404
      </p>
      <h1 className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-slate-900">
        Esta página no existe
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Puede que el enlace esté mal o que la página se haya movido al reorganizar la
        documentación.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Volver al inicio
        </Link>
        <Link
          href="/docs"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Ir a la documentación
        </Link>
      </div>
    </div>
  );
}
