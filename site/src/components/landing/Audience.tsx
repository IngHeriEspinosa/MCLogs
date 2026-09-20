import Link from "next/link";

const AUDIENCE = [
  {
    title: "Equipos que trabajan con NetSuite",
    body: "Los logs de SuiteScript viven dentro de la cuenta, se pierden entre ejecuciones y buscar en ellos es incómodo. La librería SuiteScript 2.1 los envía fuera y añade sola scriptId, deploymentId, accountId, userId y el governance restante.",
    link: { href: "/docs/integracion", label: "Ver la integración con NetSuite" },
  },
  {
    title: "Backends repartidos en varios servicios",
    body: "Cuando una operación cruza tres procesos, el error aparece en uno y la causa está en otro. Con un traceId compartido, MCLog reconstruye la secuencia completa en una sola vista.",
    link: { href: "/docs/manual-de-usuario", label: "Cómo se investiga una traza" },
  },
  {
    title: "Procesos batch, ETL y tareas programadas",
    body: "Un Map/Reduce o un ETL genera miles de líneas por ejecución. La ingesta por lotes acepta hasta 500 logs por petición, así que un proceso masivo no se convierte en miles de llamadas HTTP.",
    link: { href: "/docs/integracion", label: "Ingesta por lotes" },
  },
  {
    title: "Quien necesita el control del dato",
    body: "Si tus logs llevan datos que no pueden salir de tu infraestructura —o simplemente no quieres una factura por volumen ingerido—, MCLog corre en tu servidor y en tu base de datos.",
    link: { href: "/docs/despliegue", label: "Desplegarlo en tu VPS" },
  },
];

export function Audience() {
  return (
    <section id="para-quien" className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Para quién está hecho
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            MCLog nació de un problema concreto y conserva esa forma: equipos pequeños que
            mantienen varias aplicaciones a la vez y no tienen un departamento de observabilidad
            detrás.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {AUDIENCE.map((item) => (
            <article key={item.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-heading text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
              <Link
                href={item.link.href}
                className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {item.link.label} →
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 rounded-xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
          <strong className="font-semibold text-slate-900">¿Y si no encajas en ninguno?</strong> El
          requisito real es más simple: si tu sistema puede hacer una petición HTTP, puede mandar
          logs a MCLog. No hace falta un SDK oficial para tu lenguaje.
        </p>
      </div>
    </section>
  );
}
