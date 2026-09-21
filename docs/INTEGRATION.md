# MCLog — Guía de Integración (API REST)

Cualquier aplicación que pueda hacer una petición HTTP puede enviar logs a MCLog. Esta guía cubre el contrato de la API y ejemplos en los lenguajes más comunes.

## Contrato de ingesta

**Endpoint individual:** `POST /api/log`
**Endpoint por lotes:** `POST /api/logs/batch` (recomendado para procesos masivos; hasta 500 logs por petición)

**Autenticación:** header `x-api-key: <API_KEY>` (la variable `API_KEY` del backend). No se necesitan usuarios ni tokens.

**Cuerpo (campos):**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `application` | string ≤120 | ✅ | Nombre de la aplicación emisora |
| `level` | `debug`\|`info`\|`warn`\|`error` | ✅ | Severidad |
| `environment` | `development`\|`staging`\|`production` | ✅ | Entorno |
| `message` | string ≤100 000 | ✅ | Mensaje del log |
| `service` | string ≤120 | — | Subcomponente (default: `application`) |
| `host` | string ≤255 | — | Máquina/instancia (default: hostname de la petición) |
| `timestamp` | ISO-8601 | — | Momento real del evento (default: ahora) |
| `traceId` | string ≤128 | — | Id de correlación entre servicios |
| `spanId` | string ≤128 | — | Id de operación dentro del trace |
| `metadata` | objeto JSON | — | Contexto libre (ids de registro, usuario, etc.) |
| `error` | objeto | — | Excepción capturada: `name`, `message`, `code`, `stack`. Se reparte en los campos de abajo |
| `errorName` | string ≤200 | — | Clase de la excepción, si prefieres darla suelta |
| `errorCode` | string ≤100 | — | Código de la app o del proveedor |
| `errorStack` | string ≤50 000 | — | Stack trace |
| `fingerprint` | string ≤64 | — | Huella de agrupación propia. Si falta, la calcula el servidor |

### Manda la excepción, no solo su mensaje

Con `error`, MCLog agrupa las repeticiones del mismo fallo en un solo grupo con su conteo. Sin él, cada mensaje con un id distinto parece un problema diferente:

```json
{
  "application": "facturacion",
  "level": "error",
  "environment": "production",
  "message": "Timeout en la pasarela de pagos",
  "error": { "name": "TimeoutError", "code": "ETIMEDOUT", "stack": "..." },
  "metadata": { "pedidoId": 991 }
}
```

Si no envías `message`, se usa el de la excepción. Un `code` numérico se guarda como texto y un `stack` en array (formato de NetSuite) se une en una cadena.

**Respuestas:** `201` creado · `400` validación (detalle en `errors`) · `401` API key inválida · `429` rate limit (default 2000/min).

## curl

```bash
curl -X POST https://mclog.tu-dominio.com/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "application": "facturacion",
    "level": "error",
    "environment": "production",
    "message": "Timeout al llamar al servicio de pagos",
    "traceId": "req-8842",
    "metadata": { "orderId": 991, "elapsedMs": 30000 }
  }'
```

Lote:

```bash
curl -X POST https://mclog.tu-dominio.com/api/logs/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{ "logs": [
    { "application": "sync", "level": "info", "environment": "production", "message": "Inicio de sincronización" },
    { "application": "sync", "level": "warn", "environment": "production", "message": "3 registros omitidos" }
  ]}'
```

## Node.js (con `@multicomputos-srl/mclog`)

```bash
npm install @multicomputos-srl/mclog
```

```ts
import { createMCLogClient } from "@multicomputos-srl/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "mi-servicio",
  environment: "production",
  onError: (err) => miLoggerLocal.warn(err.message),   // opcional
});

await mclog.info("Servidor iniciado");

// En un catch: extrae clase, codigo y stack, y agrupa las repeticiones
try { await cobrar(pedido); }
catch (err) { await mclog.captureException(err, { metadata: { pedidoId: pedido.id } }); }
await mclog.sendBatch([
  { level: "info", message: "evento 1" },
  { level: "warn", message: "evento 2" },
]);
```

Los errores de red **no rompen tu aplicación**: la función devuelve `false` y sigue. La librería no escribe en tu consola por su cuenta — si quieres enterarte de los fallos usa el hook `onError`, o pide excepciones con `throwOnError: true`.

`sendBatch` **trocea automáticamente** al tamaño máximo del servidor, así que puedes pasarle un array de cualquier longitud.

Referencia completa de opciones: [packages/mclog/README.md](../packages/mclog/README.md).

## Node.js (fetch puro, sin dependencias)

```js
const sendLog = (entry) =>
  fetch("https://mclog.tu-dominio.com/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.MCLOG_API_KEY },
    body: JSON.stringify(entry),
  }).catch((e) => console.error("MCLog no disponible:", e.message));

sendLog({ application: "worker", level: "info", environment: "production", message: "Job completado" });
```

## Python

```python
import requests

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
        print(f"MCLog no disponible: {e}")  # nunca romper la app por el logging

send_log("etl-ventas", "error", "Fallo cargando CSV", filename="ventas.csv", line=120)
```

## NetSuite (SuiteScript 2.1)

Usa la librería lista en [`integrations/netsuite/`](../integrations/netsuite/README.md):

```js
define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
    const appLog = mclog.createLogger({ application: 'MiSuiteApp', environment: 'production' });
    appLog.info('Registro procesado', { recordId: 123 });
    appLog.error('Fallo de sincronización', { recordId: 456 });
});
```

Incluye automáticamente `scriptId`, `deploymentId`, `accountId`, `userId` y governance restante en `metadata`.

## Buenas prácticas

1. **Nunca bloquees tu app por el logging** — todos los clientes de esta guía capturan errores de red.
2. **Usa lotes** en procesos masivos (Map/Reduce, ETL, workers): 1 petición de 500 logs en lugar de 500 peticiones.
3. **Usa `traceId`** para correlacionar una operación que cruza varios sistemas (pásalo entre servicios y búscalo en el dashboard).
4. **`metadata` compacta**: ids y valores relevantes, no dumps completos de registros (el límite del body es 3 MB, pero la consulta agradece payloads pequeños).
5. **Una `application` por app real** y `service` para el subcomponente — así el filtro por aplicación del dashboard se mantiene útil.
6. **Una clave por emisor, con los permisos justos.** Créalas desde el dashboard (Ajustes → API keys) con permiso `ingest` y acotadas a su aplicación: así una clave filtrada no puede leer nada ni escribir en nombre de otra. Rotarlas no corta el servicio: creas la nueva, actualizas al emisor y revocas la vieja.
7. **Manda la excepción entera** en el campo `error` cuando registres un fallo. Es lo que permite agrupar.

## Consulta programática (opcional)

Las consultas requieren JWT (usuario del dashboard):

```bash
# 1. Login
curl -s -X POST https://mclog.tu-dominio.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"***"}'
# → { "accessToken": "...", ... }

# 2. Consultar con filtros
curl -s "https://mclog.tu-dominio.com/api/logs?level=error&application=facturacion&from=2026-08-01T00:00:00Z&sort=timestamp:desc&pageSize=50" \
  -H "Authorization: Bearer <accessToken>"

# 3. Exportar (aplica los mismos filtros)
curl -s "https://mclog.tu-dominio.com/api/logs?format=csv&level=error" \
  -H "Authorization: Bearer <accessToken>" -o errores.csv
```

Referencia completa de la API: [docs/TECHNICAL.md](TECHNICAL.md) o Swagger en `/docs`.

## Conectar un asistente de IA

Si lo que quieres es que Claude Code, Cursor o Claude Desktop consulten estos logs por su cuenta, no hace falta programar nada: MCLog expone un servidor MCP en `/mcp`. Ver [AI_INTEGRATION.md](AI_INTEGRATION.md).
