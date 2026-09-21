import Link from "next/link";
import { CodeTabs, type CodeSample } from "@/components/CodeTabs";
import { highlightCode } from "@/lib/highlight";
import { NPM_PACKAGE, NPM_URL } from "@/lib/site";

/**
 * Los ejemplos son los mismos de docs/INTEGRATION.md. Si cambia el contrato de
 * la API hay que tocar los dos sitios; se duplican a proposito porque aqui van
 * recortados a lo minimo que se entiende de un vistazo.
 */
const SAMPLES: { id: string; label: string; language: string; code: string; note?: string }[] = [
  {
    id: "node",
    label: "Node.js",
    language: "typescript",
    note: "Un fallo de red devuelve false y sigue: el logging nunca tumba tu aplicación.",
    code: `import { createMCLogClient } from "@multicomputos-srl/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "facturacion",
  environment: "production",
});

await mclog.info("Servidor iniciado");

try {
  await cobrar(pedido);
} catch (err) {
  // Extrae clase, codigo y stack, y agrupa las repeticiones del mismo fallo
  await mclog.captureException(err, { metadata: { pedidoId: pedido.id } });
}`,
  },
  {
    id: "curl",
    label: "curl / cualquier HTTP",
    language: "bash",
    note: "Si tu sistema puede hacer un POST, ya es compatible. No hace falta ningún SDK.",
    code: `curl -X POST https://mclog.tu-dominio.com/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "application": "facturacion",
    "level": "error",
    "environment": "production",
    "message": "Timeout al llamar al servicio de pagos",
    "traceId": "req-8842",
    "metadata": { "orderId": 991, "elapsedMs": 30000 }
  }'`,
  },
  {
    id: "python",
    label: "Python",
    language: "python",
    note: "El try/except es intencionado: que MCLog esté caído no puede romper tu proceso.",
    code: `import requests

MCLOG = "https://mclog.tu-dominio.com"
HEADERS = {"x-api-key": "TU_API_KEY"}

def send_log(application, level, message, environment="production", **metadata):
    try:
        requests.post(
            f"{MCLOG}/api/log",
            json={
                "application": application,
                "level": level,
                "environment": environment,
                "message": message,
                "metadata": metadata or None,
            },
            headers=HEADERS,
            timeout=5,
        )
    except requests.RequestException as e:
        print(f"MCLog no disponible: {e}")

send_log("etl-ventas", "error", "Fallo cargando CSV", filename="ventas.csv", line=120)`,
  },
  {
    id: "netsuite",
    label: "NetSuite",
    language: "javascript",
    note: "Añade solo scriptId, deploymentId, accountId, userId y el governance restante en metadata.",
    code: `define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
    const appLog = mclog.createLogger({
        application: 'MiSuiteApp',
        environment: 'production',
    });

    appLog.info('Registro procesado', { recordId: 123 });
    appLog.error('Fallo de sincronizacion', { recordId: 456 });
});`,
  },
  {
    id: "ia",
    label: "Asistente de IA",
    language: "json",
    note: "Pega esto en tu cliente MCP y pregúntale a la IA por tus errores en lenguaje natural.",
    code: `{
  "mcpServers": {
    "mclog": {
      "url": "https://mclog.tu-dominio.com/mcp",
      "headers": {
        "Authorization": "Bearer mclog_xxxxxxxx_tu-clave"
      }
    }
  }
}`,
  },
];

export function Examples() {
  const samples: CodeSample[] = SAMPLES.map((sample) => ({
    id: sample.id,
    label: sample.label,
    note: sample.note,
    html: highlightCode(sample.code, sample.language),
  }));

  return (
    <section id="ejemplos" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <h2 className="section-title font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Ejemplos de uso
        </h2>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          El mismo servicio recibe logs de entornos muy distintos. Así se ve enviar uno desde cada
          uno.
        </p>
      </div>

      <div className="mt-10">
        <CodeTabs samples={samples} />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        La librería de Node se instala desde npm como{" "}
        <a
          href={NPM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-medium text-primary-600 hover:text-primary-700"
        >
          {NPM_PACKAGE}
        </a>
        . Contrato completo de la API, ingesta por lotes, consulta programática y buenas prácticas
        en la{" "}
        <Link href="/docs/integracion" className="font-medium text-primary-600 hover:text-primary-700">
          guía de integración
        </Link>
        .
      </p>
    </section>
  );
}
