import Link from "next/link";

/** Resumen de docs/FEATURES.md; el desglose completo vive alli. */
const FEATURES = [
  ["Ingesta individual y por lotes", "Hasta 500 logs por petición, con captura de excepciones (clase, código y stack)."],
  ["Agrupación de errores", "Las repeticiones del mismo fallo forman un grupo con su conteo."],
  ["Consulta con filtros combinables", "Nivel, entorno, aplicación, servicio, host, traceId, huella, fechas y texto libre."],
  ["Traza y contexto", "La operación completa por traceId y lo ocurrido alrededor de cualquier log."],
  ["Estadísticas en vivo", "Serie por hora y nivel para ver cuándo empezó un incidente."],
  ["Logs en vivo", "El dashboard recibe los logs según llegan, por Server-Sent Events."],
  ["Exportación", "CSV y NDJSON respetando los filtros activos."],
  ["Snapshots compartibles", "Una copia congelada de Logs, Errores o una Traza con su enlace, pública o de equipo, con vista previa en los chats."],
  ["API keys con permisos", "Permisos ingest, read o metrics, acotables por aplicación, caducables y revocables."],
  ["Usuarios y roles", "Administrables desde el dashboard, con cambio de contraseña y cierre de sesiones."],
  ["Alertas", "Webhook firmado, correo y Telegram, con reglas de umbral o de error nuevo."],
  ["Retención automática", "De 3 meses a 5 años, más limpieza puntual por fecha y aplicación."],
  ["Acceso para IA (MCP)", "Ocho herramientas propias para que un asistente investigue los logs."],
  ["Observabilidad del servicio", "Endpoints /health y /metrics en formato Prometheus."],
  ["Despliegue con Docker", "Compose y Caddy, HTTPS automático y copias de seguridad diarias."],
];

export function Features() {
  return (
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="section-title font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Qué incluye
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Todo viene en la misma instalación. No hay edición de pago ni funciones reservadas.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <svg
                viewBox="0 0 20 20"
                className="mt-0.5 h-5 w-5 flex-none text-accent-500"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="font-heading text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <Link
          href="/docs/funcionalidades"
          className="mt-10 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Desglose completo, funcionalidad por funcionalidad →
        </Link>
      </div>
    </section>
  );
}
