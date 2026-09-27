---
name: mclog
description: Instala MCLog (servicio central de logs) e integra cualquier sistema para que le envíe logs, o conecta un asistente de IA para consultarlos. Cubre el despliegue del servidor (VPS con Docker Compose y Caddy, CapRover + Railway, local), la creación de espacios y API keys, y la implementación del cliente en NetSuite (SuiteScript 2.1 con lib_mclog.js), Node.js/TypeScript (@multicomputos-srl/mclog), sistemas custom por HTTP (Python, C#/.NET, PHP, Java, Go, PowerShell, curl), asistentes de IA por MCP, Prometheus y webhooks de alertas. Úsalo cuando pidan "instalar MCLog", "desplegar MCLog", "enviar logs a MCLog", "integrar NetSuite/Node/Python/.NET/PHP/Java/Go con MCLog", "centralizar logs", "crear una API key de MCLog" o "conectar una IA a MCLog".
---

# MCLog: instalación e integración

Guía operativa para un agente de IA que tiene que **poner MCLog en marcha** o **conectar un sistema** a él por el camino más corto y seguro. Resume y enlaza la documentación oficial: <https://ingheriespinosa.github.io/MCLogs/docs>.

Autor: **Ing. Heri Espinosa** · Repositorio: <https://github.com/IngHeriEspinosa/MCLogs>

---

## 0. Principios: la implementación óptima

Aplícalos siempre. Si el usuario pide algo que los contradice, adviérteselo antes de seguir.

1. **Una sola instancia central.** Todos los sistemas envían a la misma API de MCLog. No despliegues una instancia por aplicación ni por cliente.
2. **Un espacio de trabajo por organización o cliente.** Aísla los datos. Cada API key pertenece al espacio en el que se crea, y lo que envía entra en ese espacio aunque la petición diga otra cosa.
3. **Una API key por emisor, con el permiso mínimo y acotada a su aplicación.**
   - `ingest` para enviar, `read` para una IA o un script que consulta, `metrics` para Prometheus.
   - Rellena siempre **Aplicaciones**. Así una clave filtrada no puede escribir en nombre de otra aplicación ni leer nada.
4. **Envía por lotes** (`POST /api/logs/batch`, hasta 500 logs). Una petición por log solo sirve para eventos sueltos y poco frecuentes.
5. **La configuración, fuera del código.**
   - La URL y la clave van en variables de entorno o en el gestor de secretos.
   - En NetSuite van en un registro personalizado.
   - Nunca las escribas en un fichero versionado ni las pegues en el chat.
6. **HTTPS obligatorio** en producción. NetSuite, además, rechaza `http://`.
7. **El logging nunca rompe la aplicación.**
   - Los envíos capturan sus errores y no esperan más de ~5 s.
   - Se reintenta solo ante `408`, `429` y `5xx`.
8. **Manda la excepción entera**, no solo su mensaje: `error: { name, code, stack }`. Es lo que permite a MCLog agrupar las repeticiones del mismo fallo.
9. **Propaga un `traceId`** entre servicios. Así una operación que cruza sistemas se ve como una sola traza.

**Cómo saber la URL base.** Si estás conectado al MCP de MCLog, la URL base es la del servidor MCP sin `/mcp`, por ejemplo `https://mclog.empresa.com/mcp` → `https://mclog.empresa.com`. Si no, pregúntala. En la topología CapRover + Railway, la API vive en su propio subdominio (`https://api-mclog…`).

---

## 1. Árbol de decisión

```text
¿Existe ya una instancia de MCLog accesible?
├─ No → §2 Instalar el servidor → §3 Preparar espacio y claves → sigue abajo
└─ Sí → ¿tienes una API key del permiso adecuado?
        ├─ No → §3 (la crea el dueño del espacio)
        └─ Sí → ¿qué sistema vas a conectar?
                ├─ NetSuite (SuiteScript 2.1) ........ §4.1
                ├─ Node.js / TypeScript / Next.js .... §4.2
                ├─ Otro lenguaje o sistema (custom) .. §4.3
                ├─ Asistente de IA (MCP) ............. §4.4
                ├─ Prometheus ........................ §4.5
                └─ Recibir alertas en otro sistema ... §4.6
```

Termina siempre con la **verificación** de §5.

---

## 2. Instalar el servidor

| Opción | Cuándo | Tiempo |
|---|---|---|
| **A. VPS con Docker Compose + Caddy** (recomendada) | Producción en un solo servidor. Todo bajo un dominio, HTTPS automático y copias diarias | ~15 min |
| **B. CapRover (API + BD) + Railway (dashboard)** | Ya hay un CapRover, o se quiere el dashboard en Railway | ~30 min |
| **C. Local** | Desarrollo o pruebas en un equipo | ~15 min |

La opción A es la más rápida y la más centralizada: un solo `docker compose up`, y solo Caddy queda expuesto a Internet.

### A. VPS con Docker Compose + Caddy (recomendada)

**Requisitos:**
- un VPS con 2 vCPU y 2 GB de RAM;
- Docker Engine 24+ con Compose v2;
- un dominio con un registro `A` apuntando al VPS;
- los puertos 80 y 443 abiertos;
- `git` y `openssl`.

```bash
# 1. Descarga y prepara la configuración
git clone https://github.com/IngHeriEspinosa/MCLogs.git mclog
cd mclog/deploy
cp .env.example .env

# 2. Genera cuatro secretos distintos
for i in 1 2 3 4; do openssl rand -hex 32; done
```

Edita `deploy/.env` y cambia **todo lo que empieza por `CAMBIAR`**:

| Variable | Valor |
|---|---|
| `MCLOG_DOMAIN` | `mclog.tu-dominio.com`, sin `https://` |
| `POSTGRES_PASSWORD` | Secreto 1 |
| `JWT_ACCESS_SECRET` | Secreto 2 |
| `JWT_REFRESH_SECRET` | Secreto 3, distinto del anterior |
| `API_KEY` | Secreto 4. Es la clave heredada: no la repartas |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Crean la **cuenta root** en el primer arranque |
| `CORS_ORIGINS` y `PUBLIC_DASHBOARD_URL` | `https://mclog.tu-dominio.com`, exacto y sin barra final |
| `RETENTION_MONTHS` | Meses de logs a conservar (3–60) |

```bash
# 3. Levanta todo: db, api, web, caddy y backup
docker compose -f docker-compose.prod.yml up -d --build

# 4. Verifica
docker compose -f docker-compose.prod.yml ps
curl https://mclog.tu-dominio.com/health   # → {"status":"ok","database":"up",...}
```

Caddy enruta `/api/*`, `/auth/*`, `/mcp`, `/health`, `/metrics` y `/docs` a la API, y el resto al dashboard. Por eso **la URL base de la API es la del dominio**.

Guía completa: [Desplegar en un VPS](https://ingheriespinosa.github.io/MCLogs/docs/desplegar-en-un-vps).

### B. CapRover (API + BD) + Railway (dashboard)

1. **Base de datos.** En CapRover, **One-Click Apps → PostgreSQL 16**:
   - app `mclog-db`, usuario `mclog`, base `mclog`;
   - **sin dominio y sin puerto publicado**.
2. **App `mclog-api`.** En CapRover:
   - dominio `api-mclog.tu-dominio.com` con HTTPS forzado;
   - **Container HTTP Port = `3000`**. Si se queda en 80, CapRover responde `502`.
3. **Variables de entorno de la API.** Solo nombres; los valores los pone el usuario:
   - `NODE_ENV=production`;
   - `DATABASE_URL=postgresql://mclog:<pwd>@srv-captain--mclog-db:5432/mclog?schema=public`;
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y `API_KEY`, con valores distintos generados con `openssl rand -hex 32`;
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`;
   - `CORS_ORIGINS` y `PUBLIC_DASHBOARD_URL` con el origen exacto del dashboard;
   - `TRUST_PROXY=1`, `FORCE_HTTPS=1`, `COOKIE_SECURE=1`, `COOKIE_SAMESITE=lax`, `RETENTION_MONTHS=3`.
4. **Despliega la API:** `cd Back_MCLog && caprover deploy`. Sube el **último commit**. Para cambios sin commitear, usa `caprover deploy -t ./deploy.tar`.
5. **Dashboard en Railway:**
   - Root Directory `frontend_mclog`, dominio propio `mclog.tu-dominio.com`;
   - variable `NEXT_PUBLIC_API_URL=https://api-mclog.tu-dominio.com`, sin barra final. Se incrusta al compilar, así que tras cambiarla hay que **redesplegar**;
   - no definas `PORT`.
6. **Verifica:** `curl https://api-mclog.tu-dominio.com/health`.

**Reglas de esta topología:**
- Los dos subdominios deben compartir dominio raíz; si no, las cookies se bloquean.
- CapRover **no** hace copias de la base: programa `pg_dump` con cron.
- Tras un proxy corporativo, usa `NODE_EXTRA_CA_CERTS` y nunca `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Guía completa: [Desplegar en CapRover y Railway](https://ingheriespinosa.github.io/MCLogs/docs/desplegar-en-caprover-y-railway).

### C. Local (desarrollo)

**Requisitos:** Node 20+, Docker Desktop y los puertos 3000, 3001 y 5435 libres.

```bash
git clone https://github.com/IngHeriEspinosa/MCLogs.git mclog && cd mclog/Back_MCLog
docker compose up -d db                 # PostgreSQL en el puerto 5435
npm install && cp .env.example .env     # los valores de ejemplo sirven en local
npx prisma migrate deploy
npm run dev                             # API en http://localhost:3000

# En otra terminal
cd ../frontend_mclog && npm install && cp .env.example .env.local && npm run dev   # http://localhost:3001
```

La cuenta root local es la del `.env` de ejemplo. Cámbiala si la instancia deja de ser solo tuya.

> El repositorio usa **npm** (tiene `package-lock.json`). Respeta esa convención dentro del repo, aunque tu equipo prefiera otro gestor.

---

## 3. Preparar espacio, usuarios y claves

Al arrancar, la API crea la **cuenta root** (`ADMIN_EMAIL`) y su espacio **Principal**.

1. **Protege la cuenta root:** entra, cambia la contraseña y activa el 2FA (**Mi cuenta**). Úsala solo para emergencias.
2. **Crea un espacio por organización o cliente:** selector de espacio → **Crear espacio**.
3. **Crea una API key por emisor** en **Espacio → API keys → Nueva clave**:
   - solo lo puede hacer el **dueño del espacio**;
   - la clave se muestra **una sola vez**.

| Emisor | Permiso | Aplicaciones |
|---|---|---|
| Una aplicación que envía logs | `ingest` (Enviar logs) | Su nombre exacto de `application` |
| Un asistente de IA o un script que consulta | `read` (Consultar logs y errores) | Las que deba ver (vacío = todas) |
| Prometheus | `metrics` | — |

**Por API.** Sirve para automatizar el alta de muchos sistemas. Usa la sesión del dueño; si tiene 2FA, el login devuelve `mfaRequired` y hay que completar `POST /auth/login/2fa`.

```bash
BASE=https://mclog.tu-dominio.com
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"owner@empresa.com","password":"***"}' | jq -r .accessToken)

# Espacios del usuario (anota el id)
curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN"

# Crear un espacio
curl -s -X POST $BASE/api/workspaces -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Cliente ACME"}'

# Crear una clave de ingesta acotada, en el espacio indicado
curl -s -X POST $BASE/api/keys -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"facturacion producción","scopes":["ingest"],"applications":["facturacion"]}'
# → 201 { "key": "mclog_xxxxxxxx_...", "apiKey": { ... } }   ← "key" solo aparece aquí
```

**Revisar las claves de todos los espacios.** El admin de plataforma, la root incluida, las ve juntas en **Plataforma → Inventario de claves** (`GET /api/admin/keys`). Cada clave aparece con sus avisos:
- lee todo el espacio;
- abandonada (sin uso en 90 días);
- nunca usada;
- caduca pronto;
- escribe como cualquiera;
- lectura sin caducidad.

Desde ahí se revoca cualquiera (`DELETE /api/admin/keys/:id`). Ante una filtración, busca la clave por su prefijo (`mclog_xxxxxxxx`) y revócala.

**Rotar una clave sin cortar el servicio:**
1. crea la nueva con los mismos permisos;
2. despliega el emisor con la nueva;
3. comprueba su **Último uso**;
4. revoca la vieja.

Si la clave se filtró, **revoca primero**.

La variable `API_KEY` del servidor está **deprecada**. No la uses en integraciones nuevas.

---

## 4. Integrar cada sistema

### 4.1 NetSuite (SuiteScript 2.1) con `lib_mclog.js`

Es la opción recomendada: una librería por cuenta, la configuración en un registro y un lote por ejecución.

**Requisito:** MCLog accesible desde Internet por **HTTPS**. NetSuite no alcanza `localhost` ni una IP privada.

1. **Descarga** <https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog.js> y, opcionalmente, `test_lib_mclog.js`, que se ejecuta con `node test_lib_mclog.js`.
2. **Crea la API key:** `ingest`, acotada a la aplicación. Usa una clave para producción y otra para cada sandbox.
3. **Crea el Record Type:** **Customization → Lists, Records, & Fields → Record Types → New**.
   - Label `MCLog Configuración`, ID `_mclog_config` (queda como `customrecord_mclog_config`).
   - **Access Type = Use Permission List**, con nivel **View** para los roles que ejecutan los scripts.
   - Campos, todos **Free-Form Text**. **Nunca Password**, porque la librería necesita leer el valor.

   | Label | ID | Obligatorio |
   |---|---|---|
   | URL de MCLog | `_mclog_url` → `custrecord_mclog_url` | Sí |
   | API key | `_mclog_api_key` → `custrecord_mclog_api_key` | Sí |
   | Aplicación | `_mclog_application` → `custrecord_mclog_application` | No (por defecto `NetSuite`) |
   | Ambiente | `_mclog_environment` → `custrecord_mclog_environment` | No: **déjalo vacío**, se deduce del tipo de cuenta |

4. **Crea un registro** con la URL (`https://…`, sin barra final) y la clave. La librería usa el primero activo. Para apagar MCLog, márcalo **Inactive**.
5. **Sube** el fichero a `/SuiteScripts/lib/lib_mclog.js`. Con SDF, va en `src/FileCabinet/SuiteScripts/lib/`.
6. **Úsala** envolviendo los puntos de entrada:

```js
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {
    const afterSubmit = (context) => {
        mcLog.info('Factura guardada', { total: context.newRecord.getValue('total') });
        try {
            sendToProvider(context.newRecord);
        } catch (e) {
            mcLog.exception('Error enviando la factura', e, { invoiceId: context.newRecord.id });
            throw e; // no se registra dos veces
        }
    };
    return mcLog.wrapEntryPoints({ afterSubmit });
});
```

**API:**
- `debug`, `info`, `warn`, `error(message, metadata?, error?)`;
- `exception(message, error, metadata?)`;
- `setDocument(type, id)`, `withDocument(type, id, fn)`, `clearDocument()`;
- `setContext(metadata)`, `wrapEntryPoints(entryPoints)`, `flush()` (si no envuelves), `errorFields(e)`.

**Reglas:**
- **Map/Reduce:** cada `map`/`reduce` es una ejecución con su propio lote. Registra solo lo excepcional; `summarize` ya añade un resumen. Si no, chocarás con el límite de 2000 peticiones por minuto.
- **Tras un refresh del sandbox:** cambia la clave del registro, porque se copia la de producción.
- **La librería no reintenta,** y necesita ≥20 unidades de governance para enviar. Cuesta 10 unidades por lote y 0 si no se registró nada.
- **Diagnóstico:** en el **Execution Log** del script, con Log Level Audit o Debug. Por ejemplo, `MCLog desactivado: …` indica que falta el registro, que la URL no es https o que el rol no tiene permiso sobre el registro.

`mclog_client.js` (configuración en constantes dentro del fichero) queda solo para scripts aislados o pruebas rápidas.

Guía: [Integrar NetSuite con lib_mclog.js](https://ingheriespinosa.github.io/MCLogs/docs/integrar-netsuite-lib-mclog).

### 4.2 Node.js / TypeScript (incluye Next.js, NestJS, Express)

```bash
npm install @multicomputos-srl/mclog      # o: pnpm add @multicomputos-srl/mclog
```

Necesita Node 18+ y no tiene dependencias en tiempo de ejecución. Crea **un único cliente**, por ejemplo en `src/mclog.ts`:

```ts
import { createMCLogClient } from "@multicomputos-srl/mclog";

export const mclog = createMCLogClient({
  baseUrl: process.env.MCLOG_URL!,
  apiKey: process.env.MCLOG_API_KEY!,
  application: "facturacion",           // igual que la restricción de la clave
  environment: process.env.NODE_ENV === "production" ? "production" : "development", // por defecto es development
  service: "api",
  onError: (err) => console.warn("MCLog no disponible:", err.message),
});
```

```ts
await mclog.info("Servidor iniciado", { port: 8080 });

try { await cobrar(pedido); }
catch (err) { await mclog.captureException(err, { metadata: { pedidoId: pedido.id } }); throw err; }

await mclog.sendBatch(entradas);   // trocea solo en ≤500 entradas y ≤1 MiB
```

**Express:** registra un manejador de errores al final de la cadena que llame a `void mclog.captureException(err, { metadata: { method: req.method, path: req.path } })`.

**Opciones útiles:**
- `timeoutMs` (5000), `maxRetries` (2), `retryBaseMs` (300);
- `maxBatchSize` (500), `batchConcurrency` (1);
- `defaultMetadata`, `throwOnError`, `onRetry`.

Los métodos devuelven `true` o `false`; no lanzan salvo con `throwOnError`.

Guía: [Integrar una aplicación Node.js](https://ingheriespinosa.github.io/MCLogs/docs/integrar-node).

### 4.3 Sistemas custom (cualquier lenguaje por HTTP)

#### Contrato de ingesta

| | |
|---|---|
| Endpoints | `POST {BASE}/api/logs/batch` con `{ "logs": [ ... ] }` (recomendado, ≤500) · `POST {BASE}/api/log` con un objeto |
| Autenticación | `x-api-key: mclog_…`, o `Authorization: Bearer mclog_…` |
| Content-Type | `application/json` |
| Respuesta correcta | `201`. El lote responde `{ "created": n }` |
| Límites | 2000 peticiones/min por clave · cuerpo ≤ 3 MB · lote ≤ 500 (configurable por root) |

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `application` | string ≤120 | ✅ | Debe estar entre las aplicaciones de la clave |
| `level` | `debug` \| `info` \| `warn` \| `error` | ✅ | |
| `environment` | `development` \| `staging` \| `production` | ✅ | |
| `message` | string ≤100 000 | ✅* | *Si falta y hay `error`, se usa `error.message` |
| `service` | string ≤120 | | Por defecto, `application` |
| `host` | string ≤255 | | |
| `timestamp` | ISO-8601 | | Hora real del evento. Imprescindible si envías en diferido |
| `traceId` / `spanId` | string ≤128 | | Correlación entre sistemas |
| `metadata` | objeto JSON | | Objeto plano, no un array. Ids y valores, no volcados |
| `error` | `{ name, message, code, stack }` | | Se reparte en `errorName`, `errorCode` y `errorStack`. `stack` admite un array |
| `errorName` / `errorCode` / `errorStack` | ≤200 / ≤100 / ≤50 000 | | Alternativa plana a `error` |
| `fingerprint` | string ≤64 | | Agrupación propia. Si falta, la calcula el servidor en `warn` y `error` |

Los textos largos **no se rechazan**: se recortan con `…` y la longitud original queda en `metadata.mclogTruncated`.

| Respuesta | Qué hacer |
|---|---|
| `201` | — |
| `400` | Error de validación (el detalle viene en `errors`). **No reintentes** |
| `401` | Clave inexistente, revocada o caducada |
| `403` | Falta el scope `ingest`, o `application` está fuera de la clave (ver `allowedApplications`). En un lote, una sola entrada así rechaza **todo** el lote |
| `413` | Trocea el lote |
| `429` | Espera lo que diga `Retry-After` y reintenta. Agrupa más en cada lote |
| `5xx` o fallo de red | Reintenta con espera exponencial |
| `403` con cabecera `Origin` | CORS: el navegador no debe enviar logs directamente. Envía desde el servidor |

#### Especificación del adaptador mínimo

Implementa esto en cualquier lenguaje que no tenga librería oficial:

1. **Configuración** leída de variables de entorno: `MCLOG_URL`, `MCLOG_API_KEY`, `MCLOG_APPLICATION`, `MCLOG_ENVIRONMENT`.
2. **Buffer en memoria** con tope, por ejemplo 1000 entradas. Si se llena, descarta y cuenta los descartes.
3. **Flush:**
   - al llegar a 200 entradas, o cada 5 s;
   - al cerrar el proceso (hook de apagado);
   - en trozos de ≤500 entradas y ≤1 MB.
4. **Envío:**
   - `POST /api/logs/batch` con timeout de 5 s;
   - 2 reintentos solo ante 408, 429 y 5xx, con backoff exponencial (300 ms, 600 ms…) y respetando `Retry-After`.
5. **Nunca lanzar** hacia la aplicación: captura, avisa por un canal local (stderr o logger) y sigue.
6. **Normalización:** pon `timestamp` en el momento del evento. Para las excepciones, rellena `error.name`, `error.code` y `error.stack`.
7. **Redacción de secretos:** antes de enviar, sustituye por `[REDACTED]` los valores de claves de metadata que contengan `pass`, `token`, `secret`, `apikey`, `authorization`, `cookie` o `credential`.
8. **`traceId`:** léelo de la petición entrante (p. ej. `x-trace-id`), o genéralo, y pásalo a las llamadas salientes.

#### Snippets

Cada snippet envía un lote y no lanza nunca. Sustituye `BASE`, o léelo del entorno.

**curl**

```bash
curl -X POST "$MCLOG_URL/api/logs/batch" -H "Content-Type: application/json" -H "x-api-key: $MCLOG_API_KEY" \
  -d '{"logs":[{"application":"sync","level":"info","environment":"production","message":"Inicio"}]}'
```

**Python (3.10+, `requests`)**

```python
import os, traceback, datetime, requests

BASE, KEY = os.environ["MCLOG_URL"], os.environ["MCLOG_API_KEY"]
APP, ENV = os.environ.get("MCLOG_APPLICATION", "mi-app"), os.environ.get("MCLOG_ENVIRONMENT", "production")

def entry(level, message, error=None, trace_id=None, **metadata):
    body = {"application": APP, "environment": ENV, "level": level, "message": message,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "traceId": trace_id, "metadata": metadata or None}
    if error is not None:
        body["error"] = {"name": type(error).__name__, "message": str(error),
                         "stack": "".join(traceback.format_exception(error))}
    return body

def send_batch(logs):
    for i in range(0, len(logs), 500):
        try:
            requests.post(f"{BASE}/api/logs/batch", json={"logs": logs[i:i + 500]},
                          headers={"x-api-key": KEY}, timeout=5)
        except requests.RequestException as e:
            print(f"MCLog no disponible: {e}")  # nunca romper la app

try:
    procesar()
except Exception as e:
    send_batch([entry("error", "Fallo procesando", error=e, pedido_id=991)])
```

**C# / .NET 8**

```csharp
using System.Net.Http.Json;

public sealed class MCLogClient(HttpClient http, string application, string environment)
{
    public async Task SendAsync(IEnumerable<object> logs)
    {
        try
        {
            using var res = await http.PostAsJsonAsync("/api/logs/batch", new { logs });
            if (!res.IsSuccessStatusCode) Console.Error.WriteLine($"MCLog HTTP {(int)res.StatusCode}");
        }
        catch (Exception ex) { Console.Error.WriteLine($"MCLog no disponible: {ex.Message}"); }
    }

    public object Entry(string level, string message, Exception? error = null, object? metadata = null) => new
    {
        application, environment, level, message, timestamp = DateTimeOffset.UtcNow, metadata,
        error = error is null ? null : new { name = error.GetType().Name, message = error.Message, stack = error.ToString() }
    };
}

// Registro (Program.cs): un HttpClient con la URL base, la clave y timeout de 5 s
builder.Services.AddHttpClient("mclog", c =>
{
    c.BaseAddress = new Uri(builder.Configuration["MCLOG_URL"]!);
    c.DefaultRequestHeaders.Add("x-api-key", builder.Configuration["MCLOG_API_KEY"]);
    c.Timeout = TimeSpan.FromSeconds(5);
});
```

**PHP 8 (ext-curl)**

```php
function mclog_send(array $logs): void {
    $ch = curl_init(getenv('MCLOG_URL') . '/api/logs/batch');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-api-key: ' . getenv('MCLOG_API_KEY')],
        CURLOPT_POSTFIELDS => json_encode(['logs' => $logs]),
    ]);
    if (curl_exec($ch) === false) error_log('MCLog no disponible: ' . curl_error($ch));
    curl_close($ch);
}

function mclog_entry(string $level, string $message, ?Throwable $e = null, array $metadata = []): array {
    return array_filter([
        'application' => getenv('MCLOG_APPLICATION'), 'environment' => getenv('MCLOG_ENVIRONMENT') ?: 'production',
        'level' => $level, 'message' => $message, 'timestamp' => gmdate('c'),
        'metadata' => $metadata ?: null,
        'error' => $e ? ['name' => get_class($e), 'code' => (string) $e->getCode(), 'stack' => $e->getTraceAsString()] : null,
    ], fn ($v) => $v !== null);
}
```

**Java 17+ (`java.net.http`)**

```java
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

public final class MCLog {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    /** logsJson: array JSON ya serializado, p. ej. con Jackson. */
    public static void sendBatch(String logsJson) {
        var request = HttpRequest.newBuilder(URI.create(System.getenv("MCLOG_URL") + "/api/logs/batch"))
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .header("x-api-key", System.getenv("MCLOG_API_KEY"))
            .POST(HttpRequest.BodyPublishers.ofString("{\"logs\":" + logsJson + "}"))
            .build();
        HTTP.sendAsync(request, HttpResponse.BodyHandlers.discarding())
            .exceptionally(ex -> { System.err.println("MCLog no disponible: " + ex.getMessage()); return null; });
    }
}
```

**Go**

```go
package mclog

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

var client = &http.Client{Timeout: 5 * time.Second}

type Entry struct {
	Application string         `json:"application"`
	Environment string         `json:"environment"`
	Level       string         `json:"level"`
	Message     string         `json:"message"`
	Timestamp   time.Time      `json:"timestamp"`
	TraceID     string         `json:"traceId,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	Error       *ErrorInfo     `json:"error,omitempty"`
}

type ErrorInfo struct {
	Name  string `json:"name"`
	Code  string `json:"code,omitempty"`
	Stack string `json:"stack,omitempty"`
}

func SendBatch(logs []Entry) {
	body, _ := json.Marshal(map[string]any{"logs": logs})
	req, err := http.NewRequest(http.MethodPost, os.Getenv("MCLOG_URL")+"/api/logs/batch", bytes.NewReader(body))
	if err != nil {
		log.Printf("MCLog: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", os.Getenv("MCLOG_API_KEY"))
	res, err := client.Do(req)
	if err != nil {
		log.Printf("MCLog no disponible: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		log.Printf("MCLog HTTP %d", res.StatusCode)
	}
}
```

**PowerShell 5.1+ (scripts de Windows, tareas programadas)**

```powershell
function Send-MCLog([string]$Level, [string]$Message, [hashtable]$Metadata = @{}, $ErrorRecord = $null) {
    $entry = @{
        application = $env:MCLOG_APPLICATION; environment = 'production'
        level = $Level; message = $Message; timestamp = (Get-Date).ToUniversalTime().ToString('o'); metadata = $Metadata
    }
    if ($ErrorRecord) {
        $entry.error = @{ name = $ErrorRecord.Exception.GetType().Name; stack = $ErrorRecord.ScriptStackTrace }
    }
    try {
        Invoke-RestMethod -Method Post -Uri "$env:MCLOG_URL/api/logs/batch" -TimeoutSec 5 `
            -Headers @{ 'x-api-key' = $env:MCLOG_API_KEY } -ContentType 'application/json' `
            -Body (@{ logs = @($entry) } | ConvertTo-Json -Depth 6) | Out-Null
    } catch { Write-Warning "MCLog no disponible: $($_.Exception.Message)" }
}
```

**Otros sistemas** (ERP, iPaaS, n8n, Zapier, Make, Celigo, bases de datos…): usa su acción HTTP genérica con el mismo contrato.
- Una petición `POST /api/logs/batch` por ejecución de flujo.
- La clave, en el almacén de credenciales de la plataforma.
- `traceId` = el id de la ejecución o del documento, por ejemplo `invoice:1234`.

Para probar una petición sin escribir código: **Espacio → Lab → Log a medida** genera el JSON y el cURL equivalentes.

### 4.4 Asistentes de IA (MCP)

1. Crea una clave **`read`**, acotada a las aplicaciones que deba ver y, si se reparte, con caducidad.
2. Conecta el cliente a `{BASE}/mcp`. El transporte es HTTP sin estado y acepta solo POST.
   - El panel **Espacio → API keys → Conectar una IA** del dashboard dice si el MCP está activo y da la URL exacta y la configuración de cada cliente, lista para copiar.
   - Cada uso por MCP queda anotado en la clave como "IA (MCP)" bajo **Último uso**.

```bash
# Claude Code
claude mcp add --transport http mclog https://mclog.tu-dominio.com/mcp \
  --header "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
```

```jsonc
// Cursor: .cursor/mcp.json · VS Code: .vscode/mcp.json usa "servers" y "type": "http"
{ "mcpServers": { "mclog": { "url": "https://mclog.tu-dominio.com/mcp",
  "headers": { "Authorization": "Bearer mclog_xxxxxxxx_tu-clave" } } } }
```

```json
// Claude Desktop (puente stdio)
{ "mcpServers": { "mclog": { "command": "npx",
  "args": ["-y", "mcp-remote", "https://mclog.tu-dominio.com/mcp", "--header", "Authorization: Bearer mclog_xxxxxxxx_tu-clave"] } } }
```

**Herramientas:**
- `list_applications`, `get_error_groups` ("qué falla"), `search_logs` ("qué pasó");
- `get_recent_errors`, `get_log`, `get_trace`, `get_log_context`, `get_stats`;
- `get_integration_skill`, que devuelve este skill.

**Recurso y prompt:**
- el recurso `mclog://skill/SKILL.md` es este skill;
- el prompt `install_skill` lo instala. En Claude Code se invoca como `/mcp__mclog__install_skill`.

**Reglas:**
- No metas la clave en ficheros versionados.
- La root puede apagar el MCP en **Plataforma → Configuración**; en ese caso responde `404`.

Guía: [Conectar una IA](https://ingheriespinosa.github.io/MCLogs/docs/conectar-una-ia).

### 4.5 Prometheus

```yaml
scrape_configs:
  - job_name: mclog
    scheme: https
    metrics_path: /metrics
    static_configs: [{ targets: ["mclog.tu-dominio.com"] }]
    authorization: { type: Bearer, credentials_file: /etc/prometheus/mclog_key }   # clave con permiso "metrics"
```

### 4.6 Alertas hacia otros sistemas (webhook)

En **Espacio → Alertas**:
- crea un canal **webhook**, email o Telegram;
- añade reglas: **error nuevo** (una huella vista por primera vez) o **umbral** (N coincidencias en la ventana).

El webhook recibe un POST JSON. Si defines un secreto, lo firma con `x-mclog-signature: sha256=<HMAC-SHA256 del cuerpo>`. **Verifica la firma** en el receptor, con comparación en tiempo constante, antes de procesarlo.

---

## 5. Verificación end-to-end

- [ ] `curl {BASE}/health` responde `{"status":"ok","database":"up"}`.
- [ ] El dashboard carga con HTTPS válido, el login funciona y la sesión no se cae al navegar.
- [ ] La cuenta root tiene la contraseña cambiada y el 2FA activo.
- [ ] Cada emisor tiene **su** clave, con el permiso mínimo y acotada a su aplicación.
- [ ] Un log de prueba del sistema integrado aparece en **Logs** filtrando por su `application` y con el `environment` correcto.
- [ ] Una excepción provocada tres veces aparece como **un** grupo con contador 3 en **Errores**.
- [ ] Si hay varios servicios, **Ver traza** muestra la operación completa por `traceId`.
- [ ] Las copias de la base están programadas y se guardan **fuera** del servidor.
- [ ] (IA) El `tools/list` del MCP responde las herramientas:

```bash
curl -s -X POST {BASE}/mcp -H "Authorization: Bearer $MCLOG_READ_KEY" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 6. Resolución de problemas

| Síntoma | Causa y solución |
|---|---|
| `502 Bad Gateway` (CapRover) | **Container HTTP Port** no es `3000` |
| La API se reinicia en bucle | Mira los logs: "Configuración insegura para producción" lista las variables con valores de ejemplo o secretos JWT iguales |
| `/health` → `503 degraded` | La API no alcanza PostgreSQL: revisa `DATABASE_URL` o el servicio `db` |
| El dashboard dice "No se pudo contactar con el servidor" | `CORS_ORIGINS` no coincide exactamente (esquema, host, sin barra final), o `NEXT_PUBLIC_API_URL` es incorrecta o no se redesplegó |
| La sesión se cae al navegar | Falta HTTPS o `COOKIE_SECURE=1`, falta `TRUST_PROXY=1`, o los dominios no comparten dominio raíz |
| `401` al enviar | Clave mal copiada, revocada o caducada |
| `403` al enviar | La clave no tiene `ingest`, o `application` no está entre las permitidas (`allowedApplications`) |
| `403 "The Lab is disabled…"` | Se envió sin API key: la petición cayó en la sesión del dashboard. Añade `x-api-key` |
| `400` | Un campo no es válido: suele ser `level` o `environment` mal escritos, o `metadata` enviada como array |
| `413` | El cuerpo supera `BODY_LIMIT` (3 MB): trocea |
| `429` | Más de 2000 peticiones/min por clave: agrupa en lotes o sube `INGEST_RATE_LIMIT_MAX` |
| NetSuite: `MCLog desactivado…` | Falta el registro activo, la URL no es `https://`, o el rol no tiene View sobre el registro |
| Los errores no se agrupan | Se envía el mensaje sin `error` (clase y stack) |
| El log no aparece | Revisa el rango de tiempo y el filtro de entorno en el dashboard; comprueba `timestamp` si envías en diferido |
| MCP `404` | El MCP está apagado en la configuración de la plataforma |
| MCP `405` | Se usó GET: el endpoint solo acepta POST |

---

## 7. Seguridad (obligatorio)

- **Nunca** leas, imprimas ni pegues el contenido de un `.env` ni una clave completa en el chat, en los logs o en la documentación. Refiérete a las variables por su nombre.
- **Secretos:**
  - generados con `openssl rand -hex 32`, todos distintos;
  - `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`;
  - la clave de ingesta, en el gestor de secretos de cada plataforma.
- **Claves:**
  - con permiso mínimo, acotadas por aplicación, con caducidad si se reparten;
  - se rotan sin corte (§3) y, si se filtran, se revocan primero;
  - revisa de vez en cuando el **Inventario de claves** (§3) y revoca las abandonadas o las que nunca se usaron.
- **Red:**
  - la base de datos nunca se expone a Internet, y solo el proxy (Caddy o nginx de CapRover) publica puertos;
  - los logs no se envían desde el navegador (CORS), sino desde el servidor.
- **Contenido:**
  - no pongas secretos ni datos personales innecesarios en `message` ni en `metadata`;
  - redacta antes de enviar.
- **Operaciones destructivas:** no ejecutes purgas, restauraciones (`restore.sh`) ni migraciones destructivas sin confirmación explícita del usuario. Nunca actúes sobre producción sin que te lo pidan.

---

## Referencias

| Tema | Documento |
|---|---|
| Índice de la documentación | <https://ingheriespinosa.github.io/MCLogs/docs> |
| Contrato REST completo | `docs/INTEGRATION.md` · `docs/TECHNICAL.md` · Swagger en `{BASE}/docs` |
| Despliegue y operación | `docs/DEPLOYMENT.md` · `docs/guias/copias-y-mantenimiento.md` |
| Espacios, usuarios y claves | `docs/guias/administrar-usuarios-y-claves.md` |
| Errores frecuentes | `docs/FAQ.md` |
| Descargar este skill | `{BASE}/api/skill` · <https://ingheriespinosa.github.io/MCLogs/mclog-SKILL.md> |
