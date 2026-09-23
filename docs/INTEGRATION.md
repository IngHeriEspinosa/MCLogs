# MCLog — Guía de Integración (API REST)

Cualquier aplicación que pueda hacer una petición HTTP puede enviar logs a MCLog. Esta guía cubre el contrato de la API y ejemplos en los lenguajes más comunes.

> **¿Prefieres ir paso a paso?** Hay guías de principio a fin para [tu primer log](guias/primeros-pasos.md), [Node.js](guias/integrar-node.md) y [NetSuite](guias/integrar-netsuite.md).

## Antes de empezar: la API key

Pide al administrador una clave (o créala tú si eres admin):

1. En el dashboard, **Espacio → API keys → Nueva clave**.
2. Rellena el formulario:
   - **Nombre**: el de tu aplicación, para reconocerla (`facturacion producción`).
   - **Permisos**: solo **Enviar logs** (`ingest`).
   - **Aplicaciones**: el nombre que usarás en el campo `application`. Así, si la clave se filtra, no puede escribir en nombre de otra ni leer nada.
3. Pulsa **Crear clave** y cópiala: **solo se muestra esta vez**. Guárdala en una variable de entorno o en el gestor de secretos de tu plataforma, nunca en el código.

> No uses la variable `API_KEY` del backend para integraciones nuevas: está **deprecada**, es la misma para todos los emisores y no se puede acotar ni rotar sin cortarlos a todos.

## Contrato de ingesta

**Endpoint individual:** `POST /api/log`
**Endpoint por lotes:** `POST /api/logs/batch` (recomendado para procesos masivos; hasta 500 logs por petición)

**Autenticación:** header `x-api-key: <tu clave>` o, si tu cliente solo permite cabeceras estándar, `Authorization: Bearer <tu clave>`. No se necesitan usuarios ni tokens.

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

`message`, `errorName`, `errorCode` y `errorStack` no se rechazan si pasan de su tope: se recortan, terminando en `…`, y la longitud original queda en `metadata.mclogTruncated`. Un stack enorme no te hace perder el log, ni el resto del lote.

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

**Respuestas:**

| Código | Significa | Qué hacer |
|---|---|---|
| `201` | Creado | — |
| `400` | Validación: falta un campo o tiene un valor inválido | El body trae `errors` con el detalle por campo. No reintentes: fallará igual |
| `401` | Clave inexistente, revocada o caducada | Revísala en Espacio → API keys |
| `403` | La clave no tiene permiso `ingest`, o `application` queda fuera de su alcance | El body trae `allowedApplications`. Es configuración, no una caída |
| `413` | El body supera el límite del servidor (3 MB) | Trocea el lote |
| `429` | Límite de ingesta superado (2000 peticiones/min por clave) | Espera y reintenta, respetando `Retry-After`; agrupa en lotes |
| `5xx` | Fallo del servidor | Reintenta con espera creciente |

> **¿Quieres ver una petición válida antes de escribir código?** Un admin puede componer un log en **Lab → Log a medida**: la pantalla muestra la petición equivalente en JSON y cURL, lista para copiar.

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

Los errores de red **no rompen tu aplicación**: la función devuelve `false` y sigue. Los fallos transitorios (red, timeout, `429`, `5xx`) se reintentan solos, con espera exponencial. La librería no escribe en tu consola por su cuenta — si quieres enterarte de los fallos usa el hook `onError`, o pide excepciones con `throwOnError: true`.

`sendBatch` **trocea automáticamente** por número de entradas y por bytes, por debajo de los topes del servidor, así que puedes pasarle un array de cualquier longitud.

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
import os
import traceback
import requests

MCLOG = "https://mclog.tu-dominio.com"
HEADERS = {"x-api-key": os.environ["MCLOG_API_KEY"]}  # la clave, fuera del código

def send_log(application, level, message, environment="production", error=None, **metadata):
    body = {
        "application": application,
        "level": level,
        "environment": environment,
        "message": message,
        "metadata": metadata or None,
    }
    if error is not None:
        # La clase y el stack permiten agrupar las repeticiones del mismo fallo
        body["error"] = {
            "name": type(error).__name__,
            "message": str(error),
            "stack": "".join(traceback.format_exception(error)),
        }
    try:
        requests.post(f"{MCLOG}/api/log", json=body, headers=HEADERS, timeout=5)
    except requests.RequestException as e:
        print(f"MCLog no disponible: {e}")  # nunca romper la app por el logging

try:
    cargar("ventas.csv")
except Exception as e:
    send_log("etl-ventas", "error", "Fallo cargando CSV", error=e, filename="ventas.csv")
```

`traceback.format_exception(error)` con un solo argumento requiere Python 3.10+.

## NetSuite (SuiteScript 2.1)

Usa la librería lista en [`integrations/netsuite/`](../integrations/netsuite/README.md):

```js
define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
    const appLog = mclog.createLogger({ application: 'MiSuiteApp', environment: 'production' });
    appLog.info('Registro procesado', { recordId: 123 });

    try {
        sincronizar(456);
    } catch (e) {
        // exception() reparte la clase del error y su stack: MCLog agrupa las repeticiones
        appLog.exception('Fallo de sincronización', e, { recordId: 456 });
    }
});
```

Incluye automáticamente `scriptId`, `deploymentId`, `executionContext`, `accountId`, `userId`, `userRole` y governance restante en `metadata`. Instalación paso a paso en [Integrar NetSuite](guias/integrar-netsuite.md).

## Buenas prácticas

1. **Nunca bloquees tu app por el logging** — todos los clientes de esta guía capturan errores de red.
2. **Usa lotes** en procesos masivos (Map/Reduce, ETL, workers): 1 petición de 500 logs en lugar de 500 peticiones.
3. **Usa `traceId`** para correlacionar una operación que cruza varios sistemas (pásalo entre servicios y búscalo en el dashboard).
4. **`metadata` compacta**: ids y valores relevantes, no dumps completos de registros (el límite del body es 3 MB, pero la consulta agradece payloads pequeños).
5. **Una `application` por app real** y `service` para el subcomponente — así el filtro por aplicación del dashboard se mantiene útil.
6. **Una clave por emisor, con los permisos justos.** Créalas desde el dashboard (Espacio → API keys) con permiso `ingest` y acotadas a su aplicación: así una clave filtrada no puede leer nada ni escribir en nombre de otra. Rotarlas no corta el servicio: creas la nueva, actualizas al emisor y revocas la vieja.
7. **Manda la excepción entera** en el campo `error` cuando registres un fallo. Es lo que permite agrupar.

## Consulta programática (opcional)

Para leer logs desde un script, lo más cómodo es **una API key con permiso `read`** (Consultar logs y errores), acotada a las aplicaciones que deba ver. No caduca a los 15 minutos como una sesión, ni depende del móvil de nadie:

```bash
# Consultar con filtros
curl -s "https://mclog.tu-dominio.com/api/logs?level=error&application=facturacion&from=2026-08-01T00:00:00Z&sort=timestamp:desc&pageSize=50" \
  -H "x-api-key: $MCLOG_READ_KEY"

# Búsqueda avanzada: cada filtro en su campo, combinados con Y
curl -s "https://mclog.tu-dominio.com/api/logs?service=checkout&errorCode=ECONNRESET&message=pago" \
  -H "x-api-key: $MCLOG_READ_KEY"

# Exportar (aplica los mismos filtros)
curl -s "https://mclog.tu-dominio.com/api/logs?format=csv&level=error" \
  -H "x-api-key: $MCLOG_READ_KEY" -o errores.csv
```

También puedes usar la sesión de un usuario del dashboard (JWT). Ten en cuenta que, si el usuario tiene **verificación en dos pasos**, el login responde `{ "mfaRequired": true, "mfaToken": "…" }` en lugar de tokens, y hay que completar `POST /auth/login/2fa` con `{ mfaToken, code }` antes de 5 minutos:

```bash
curl -s -X POST https://mclog.tu-dominio.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"yo@empresa.com","password":"***"}'
# → { "accessToken": "...", ... }                  sin 2FA
# → { "mfaRequired": true, "mfaToken": "..." }      con 2FA: falta el segundo paso
```

Luego, `Authorization: Bearer <accessToken>` en cada consulta. Parámetros de búsqueda completos en [TECHNICAL.md § GET /api/logs](TECHNICAL.md#get-apilogs).

Referencia completa de la API: [docs/TECHNICAL.md](TECHNICAL.md) o Swagger en `/docs`.

## Conectar un asistente de IA

Si lo que quieres es que Claude Code, Cursor o Claude Desktop consulten estos logs por su cuenta, no hace falta programar nada: MCLog expone un servidor MCP en `/mcp`. Ver [AI_INTEGRATION.md](AI_INTEGRATION.md).
