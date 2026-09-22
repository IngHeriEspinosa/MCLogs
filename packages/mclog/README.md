# @multicomputos-srl/mclog

Cliente oficial del servicio de logs centralizados **MCLog**, para Node.js.

- **Cero dependencias en runtime** — usa `fetch` nativo (Node >= 18).
- **A prueba de fallos** — si MCLog no responde, tu aplicación no se cae.
- **Reintento ante saturación** — un `429` o un `5xx` no descarta el log en silencio.
- **Tipado completo** — TypeScript de primera clase, con declaraciones `.d.ts`.
- **Middleware Express opcional** — en un entry point aparte, para no arrastrar Express si no lo usas.

## Instalación

```bash
npm install @multicomputos-srl/mclog
```

## Cliente REST

```ts
import { createMCLogClient } from "@multicomputos-srl/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "mi-servicio",   // default de todas las llamadas
  environment: "production",    // default de todas las llamadas
});

await mclog.info("Servidor iniciado");
await mclog.warn("Cache no disponible, usando fallback", { cache: "redis" });
await mclog.error("Stock insuficiente", { orderId: 42 });
```

`debug`, `info`, `warn` y `error` reciben el mensaje y, opcionalmente, un objeto de
metadata. Para registrar una **excepción** usa `captureException` (abajo) en lugar de
meter `err.message` en la metadata: así el servicio puede agrupar las repeticiones.

### Capturar una excepción

```ts
try {
  await cobrar(pedido);
} catch (err) {
  await mclog.captureException(err, { metadata: { pedidoId: pedido.id } });
}
```

Extrae la clase del error, su código y su stack a campos propios. Con eso el
servicio **agrupa las repeticiones del mismo fallo en un solo error** en lugar de
en uno por cada pedido: en el dashboard aparece una línea con el número de veces
que ha ocurrido, no cien líneas iguales.

Acepta cualquier cosa que se haya lanzado, no solo un `Error`: una cadena, un
objeto con `name`/`message`/`code`/`stack`, o incluso `null`. Nunca rompe la
aplicación emisora. Con `message` se pone un texto propio y el detalle de la
excepción se conserva aparte:

```ts
await mclog.captureException(err, {
  message: "Fallo al procesar el pedido",
  metadata: { pedidoId: 42 },
});
```

`captureException` usa el nivel `error` (se puede cambiar con `level`), y como mensaje
el de la excepción o, si no tiene, `"Unhandled exception"`. Admite también el resto de
campos de una entrada (`service`, `traceId`, `fingerprint`…).

El mismo reparto ocurre si pasas `error` a `send`:

```ts
await mclog.send({ level: "error", message: "Fallo al facturar", error: err });
```

Si necesitas el reparto sin enviar nada, por ejemplo para tu propio logger, usa
`extractError`:

```ts
import { extractError } from "@multicomputos-srl/mclog";

extractError(err); // → { message, errorName, errorCode, errorStack } (solo los que existan)
```

### Entrada completa

```ts
await mclog.send({
  level: "info",
  message: "Pedido sincronizado",
  service: "orders-worker",
  traceId: "req-1234",
  metadata: { orderId: 42 },
});
```

En `send`, todo es opcional: `application`, `environment`, `service` y `host` toman el
valor por defecto del cliente, `level` es `info` si no se indica, y `message`, el de
`error` o una cadena vacía.

### Lotes

`sendBatch` trocea automáticamente en peticiones de como mucho `maxBatchSize` entradas
(500 por defecto, el límite del servidor) y `maxBatchBytes` bytes (1 MiB por defecto,
por debajo de los 3 MB de `BODY_LIMIT`), así que puedes pasarle un array de cualquier
tamaño y con entradas de cualquier peso. Una entrada que por sí sola pase de
`maxBatchBytes` viaja en una petición propia, para que si el servidor la rechaza no
arrastre a las demás:

```ts
await mclog.sendBatch(
  registros.map((r) => ({ level: "info", message: r.mensaje, metadata: r }))
);
```

Cada trozo se envía y se reintenta **por su cuenta**. Si uno falla definitivamente, los
demás se siguen enviando, `sendBatch` resuelve a `false` y `onError` se invoca una vez
por cada trozo fallido. Con `throwOnError: true`, en cambio, la promesa se rechaza con el
primer trozo que falle.

### Opciones

| Opción | Tipo | Default | Descripción |
|---|---|---|---|
| `baseUrl` | `string` | — | **Obligatorio.** URL raíz del servicio MCLog. |
| `apiKey` | `string` | — | **Obligatorio.** Se envía en la cabecera `x-api-key`. |
| `application` | `string` | `'unknown-app'` | Aplicación por defecto. |
| `environment` | `'development' \| 'staging' \| 'production'` | `'development'` | Entorno por defecto. |
| `service` | `string` | — | Servicio por defecto. |
| `host` | `string` | — | Host por defecto. |
| `defaultMetadata` | `Record<string, unknown>` | — | Metadata mezclada en toda entrada; la de cada llamada gana. |
| `throwOnError` | `boolean` | `false` | Si `true`, los fallos se lanzan en vez de silenciarse. |
| `timeoutMs` | `number` | `5000` | Timeout por petición. |
| `maxBatchSize` | `number` | `500` | Entradas por petición en `sendBatch`. Debe ser <= al `MAX_BATCH_SIZE` del servidor. |
| `maxBatchBytes` | `number` | `1048576` | Bytes por petición en `sendBatch` (1 MiB). Debe quedar por debajo del `BODY_LIMIT` del servidor. |
| `maxRetries` | `number` | `2` | Reintentos tras el primer intento ante un fallo recuperable. `0` lo desactiva. |
| `retryBaseMs` | `number` | `300` | Base de la espera exponencial con jitter entre reintentos. |
| `batchConcurrency` | `number` | `1` | Trozos de `sendBatch` enviados a la vez. `1` = en serie. |
| `headers` | `Record<string, string>` | — | Cabeceras extra (proxy, APM, multi-tenant…). |
| `onError` | `(error: Error) => void` | — | Se invoca al fallar **definitivamente**, agotados los reintentos, si `throwOnError` es `false`. |
| `onRetry` | `(info) => void` | — | Se invoca antes de cada reintento con `{ attempt, delayMs, error }`. |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Implementación de `fetch` a usar (tests, proxies). |

### Reintentos

Un envío que falla por algo transitorio se reintenta solo. Cuenta como transitorio un
fallo de red, un timeout, un `408`, un `429` del limitador de ingesta y cualquier `5xx`.

No se reintenta un `4xx` que no sea `408` ni `429`: un `400` de validación, un `401` con
la clave mal o un `403` por aplicación fuera de alcance dan la misma respuesta por muchas
veces que se repitan, y solo gastarían cuota.

La espera entre intentos es exponencial con jitter (`retryBaseMs` × 2ⁿ, ±50 %). El jitter
importa cuando caen varias instancias a la vez: sin él volverían todas al mismo tiempo y
repetirían la avalancha. Si la respuesta trae `Retry-After` (típico de un `429` o un
`503`), esa cabecera manda sobre el cálculo.

```ts
const mclog = createMCLogClient({
  baseUrl: "...",
  apiKey: "...",
  maxRetries: 3,
  onRetry: ({ attempt, delayMs }) => metrics.increment("mclog.retry", { attempt, delayMs }),
});
```

`onRetry` avisa de cada reintento; `onError` solo se invoca al rendirse. Un servicio que
reintenta a menudo está avisando de que va justo de cuota de ingesta.

### Manejo de errores

Por defecto **los fallos no se propagan y no se escribe nada en tu consola**: un problema
en el servicio de logs no debe tumbar ni ensuciar la aplicación emisora. Cada método
devuelve `Promise<boolean>` indicando si el envío fue aceptado.

Para enterarte de los fallos, pasa `onError`:

```ts
const mclog = createMCLogClient({
  baseUrl: "...",
  apiKey: "...",
  onError: (err) => miLoggerLocal.warn({ err }, "MCLog no disponible"),
});
```

O bórralo todo y gestiona tú las excepciones con `throwOnError: true`.

## La API key

La clave se manda en `x-api-key` y necesita el scope **`ingest`**. Se crea desde el
dashboard, en **Administración → API keys** (hace falta rol admin), o con `POST /api/keys`.
El secreto se muestra una sola vez: guárdalo en una variable de entorno, nunca en el código.

Evita la `API_KEY` heredada de la configuración del servidor: está deprecada, es una sola
para todos los emisores y no se puede acotar ni rotar sin cortar a todos.

Una clave puede además estar acotada a ciertas aplicaciones. Si mandas un log de una
aplicación fuera de su alcance, el servicio responde `403` con la lista permitida:

```json
{ "error": "API key not allowed for application \"otra-app\"", "allowedApplications": ["mi-servicio"] }
```

Ese `403` **no se reintenta**: es un error de configuración, no una caída. Revisa el
`application` que mandas o el alcance de la clave.

## Middleware de validación (Express)

Se importa desde el subpath `/express`. Requiere `express` y `express-validator`
instalados en tu proyecto (son *peer dependencies* opcionales):

```bash
npm install express express-validator
```

**Si usas TypeScript**, añade también los tipos de Express. Express 4 no trae los
suyos, y estas cadenas se tipan como `RequestHandler`, así que sin ellos el
subpath `/express` no compila:

```bash
npm install -D @types/express
```

```ts
import express from "express";
import { validateLog } from "@multicomputos-srl/mclog/express";

const app = express();
app.use(express.json());

app.post("/mi-endpoint-de-logs", ...validateLog, (req, res) => {
  // req.body ya validado
  res.status(201).json({ ok: true });
});
```

> **Usa el spread (`...validateLog`).** Pasar el array tal cual también funciona en runtime
> —Express aplana arrays— pero `@types/express` elige entonces una sobrecarga que pierde la
> inferencia y tu handler recibe `req`/`res` como `any`.

Ante un cuerpo inválido responde `400` con:

```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error" } } }
```

Para un endpoint de lotes con cuerpo `{ logs: [...] }` usa `validateLogBatch`, que aplica
las mismas reglas a cada entrada y señala el índice que falla (`logs[1].level`):

```ts
import { validateLogBatch } from "@multicomputos-srl/mclog/express";

app.post("/mis-logs/batch", ...validateLogBatch, (req, res) => {
  res.status(201).json({ recibidos: req.body.logs.length });
});
```

> Estas reglas son un espejo de las del servidor MCLog y aceptan, rechazan y recortan
> exactamente lo mismo, objeto `error` incluido: un cuerpo que pase por aquí pasa por el
> servicio. La única excepción es el número máximo de entradas por lote, que fija el
> servidor con `MAX_BATCH_SIZE` y este paquete no puede conocer.

`validateLog` y `validateLogBatch` ya incluyen dos pasos previos, que también se exportan
por si montas tu propia cadena de validación:

| Middleware | Qué hace |
|---|---|
| `normalizeErrorFields` | Reparte el objeto `error` de cada entrada en `errorName`, `errorCode`, `errorStack` y `message` (lo escrito a mano manda) |
| `truncateLongFields` | Recorta `message`, `errorName`, `errorCode` y `errorStack` a su tope y anota la longitud original en `metadata.mclogTruncated`. Va después de `normalizeErrorFields` |

Los dos funcionan igual con una entrada suelta o con `{ logs: [...] }`.


## Contrato de una entrada

| Campo | Obligatorio | Tipo |
|---|---|---|
| `application` | sí | `string` (máx. 120) |
| `level` | sí | `debug` \| `info` \| `warn` \| `error` |
| `environment` | sí | `development` \| `staging` \| `production` |
| `message` | sí | `string` (máx. 100 000) |
| `service` | no | `string` (máx. 120) |
| `host` | no | `string` (máx. 255) |
| `timestamp` | no | `string` (ISO 8601) |
| `traceId` | no | `string` (máx. 128) |
| `spanId` | no | `string` (máx. 128) |
| `metadata` | no | objeto libre o `null` |
| `error` | no | `Error` o cualquier objeto con `name` / `message` / `code` / `stack` |
| `errorName` | no | `string` (máx. 200) |
| `errorCode` | no | `string` o `number` (máx. 100) |
| `errorStack` | no | `string` (máx. 50 000) |
| `fingerprint` | no | `string` (máx. 64) |

`message`, `errorName`, `errorCode` y `errorStack` no se rechazan si pasan de su tope: se
recortan, terminando en `…`, y la longitud original queda en `metadata.mclogTruncated`
(p. ej. `{ "errorStack": 84211 }`). Así un stack enorme no tumba el lote entero. El resto de
topes sí se rechazan con `400`.

`error` es un atajo: se reparte en `errorName`, `errorCode` y `errorStack`, y aporta el
`message` si no mandas ninguno. Los campos planos que pongas a mano tienen prioridad.

`fingerprint` es la huella de agrupación. Si no la mandas, el servidor la calcula para
los niveles `error` y `warn`; mandarla permite agrupar con criterio propio.

## Requisitos

Node.js **>= 18** (necesita `fetch` y `AbortSignal.timeout` nativos).

## Desarrollo

```bash
npm install
npm run build      # tsc → dist/ con .d.ts y source maps
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## Licencia

MIT
