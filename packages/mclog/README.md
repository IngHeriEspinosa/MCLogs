# @enviromentmc/mclog

Cliente oficial del servicio de logs centralizados **MCLog**, para Node.js.

- **Cero dependencias en runtime** — usa `fetch` nativo (Node >= 18).
- **A prueba de fallos** — si MCLog no responde, tu aplicación no se cae.
- **Tipado completo** — TypeScript de primera clase, con declaraciones `.d.ts`.
- **Middleware Express opcional** — en un entry point aparte, para no arrastrar Express si no lo usas.

## Instalación

```bash
npm install @enviromentmc/mclog
```

## Cliente REST

```ts
import { createMCLogClient } from "@enviromentmc/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "mi-servicio",   // default de todas las llamadas
  environment: "production",    // default de todas las llamadas
});

await mclog.info("Servidor iniciado");
await mclog.warn("Cache no disponible, usando fallback");
await mclog.error("Fallo al procesar pedido", { orderId: 42, error: err.message });
```

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

El mismo reparto ocurre si pasas `error` a `send`:

```ts
await mclog.send({ level: "error", message: "Fallo al facturar", error: err });
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

### Lotes

`sendBatch` trocea automáticamente en peticiones de `maxBatchSize` (500 por defecto,
el límite del servidor), así que puedes pasarle un array de cualquier tamaño:

```ts
await mclog.sendBatch(
  registros.map((r) => ({ level: "info", message: r.mensaje, metadata: r }))
);
```

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
| `maxBatchSize` | `number` | `500` | Entradas por petición en `sendBatch`. |
| `headers` | `Record<string, string>` | — | Cabeceras extra (proxy, APM, multi-tenant…). |
| `onError` | `(error: Error) => void` | — | Se invoca en cada fallo cuando `throwOnError` es `false`. |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Implementación de `fetch` a usar (tests, proxies). |

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

## Middleware de validación (Express)

Se importa desde el subpath `/express`. Requiere `express` y `express-validator`
instalados en tu proyecto (son *peer dependencies* opcionales):

```bash
npm install express express-validator
```

```ts
import express from "express";
import { validateLog } from "@enviromentmc/mclog/express";

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

## Contrato de una entrada

| Campo | Obligatorio | Tipo |
|---|---|---|
| `application` | sí | `string` (máx. 120) |
| `level` | sí | `debug` \| `info` \| `warn` \| `error` |
| `environment` | sí | `development` \| `staging` \| `production` |
| `message` | sí | `string` |
| `service` | no | `string` |
| `host` | no | `string` |
| `timestamp` | no | `string` (ISO 8601) |
| `traceId` | no | `string` |
| `spanId` | no | `string` |
| `metadata` | no | objeto libre o `null` |

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
