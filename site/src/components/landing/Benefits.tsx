const BENEFITS = [
  {
    title: "Un único lugar para buscar",
    body: "Deja de entrar servidor por servidor y consola por consola. Filtra por nivel, entorno, aplicación, servicio, host, traceId o fecha, y busca texto libre sobre todo lo demás.",
  },
  {
    title: "Los errores repetidos se agrupan solos",
    body: "MCLog calcula una huella de cada fallo. Mil repeticiones del mismo error son un grupo con su conteo, no mil líneas que revisar una a una.",
  },
  {
    title: "Una operación completa, de punta a punta",
    body: "Pasa un traceId entre tus servicios y reconstruye la operación entera en una sola vista, aunque haya cruzado tres sistemas distintos.",
  },
  {
    title: "Tu asistente de IA investiga por ti",
    body: "El servidor MCP integrado deja que Claude Code, Cursor o Claude Desktop consulten los logs con herramientas propias, sin que le pegues fragmentos a mano.",
  },
  {
    title: "Te enteras sin tener que mirar",
    body: "Alertas por webhook firmado, correo o Telegram, con reglas de umbral o de error nuevo y silencio configurable para no acabar ignorándolas.",
  },
  {
    title: "El dato es tuyo",
    body: "Corre en tu servidor, con tu PostgreSQL y tu política de retención. Sin telemetría, sin terceros y sin una factura que crece con el volumen.",
  },
];

export function Benefits() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <h2 className="section-title font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Por qué centralizar los logs
        </h2>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          El problema no suele ser que falten logs, sino que están repartidos y nadie los mira hasta
          que algo se rompe.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <article
            key={benefit.title}
            className="rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <h3 className="font-heading text-lg font-semibold text-slate-900">{benefit.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{benefit.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
