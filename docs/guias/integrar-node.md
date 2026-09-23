# Integrar una aplicación Node.js

Envía los logs y las excepciones de tu aplicación Node.js a MCLog con la librería oficial `@multicomputos-srl/mclog`.

## Qué vas a conseguir

- Tu aplicación envía logs a MCLog con una línea por evento.
- Las excepciones llegan con su clase, código y stack, así que MCLog **agrupa las repeticiones** del mismo fallo.
- Si MCLog no responde, tu aplicación sigue funcionando: la librería reintenta y, si no lo consigue, se rinde en silencio.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| Node.js **18 o superior** | La librería usa el `fetch` nativo |
| La **URL** de tu MCLog | Por ejemplo `https://api-mclog.tu-dominio.com`, o `http://localhost:3000` en local |
| Una **API key con permiso `ingest`** | Si no la tienes, sigue los pasos 1 a 5 abajo, o pídesela a un admin |

## Paso 1 — Crea una API key para tu aplicación

1. En el dashboard, abre **Espacio → API keys** y pulsa **Nueva clave**.
2. **Nombre**: el de tu aplicación y entorno, por ejemplo `facturacion producción`.
3. **Permisos**: solo **Enviar logs**.
4. **Aplicaciones**: escribe el nombre exacto que usarás en `application`, por ejemplo `facturacion`. Así, si la clave se filtra, no podrá escribir en nombre de otra aplicación ni leer nada.
5. Pulsa **Crear clave**, copia la clave y pulsa **Ya la he guardado**.

## Paso 2 — Guarda la clave como variable de entorno

Nunca en el código. En local, por ejemplo en tu `.env`:

```bash
MCLOG_URL=https://api-mclog.tu-dominio.com
MCLOG_API_KEY=mclog_...
```

En producción, en el gestor de secretos o las variables de tu plataforma.

## Paso 3 — Instala la librería

```bash
npm install @multicomputos-srl/mclog
```

No trae dependencias en tiempo de ejecución.

## Paso 4 — Crea el cliente una sola vez

Crea un módulo, por ejemplo `src/mclog.ts`, y reutilízalo en toda la aplicación:

```ts
import { createMCLogClient } from "@multicomputos-srl/mclog";

export const mclog = createMCLogClient({
  baseUrl: process.env.MCLOG_URL!,
  apiKey: process.env.MCLOG_API_KEY!,
  application: "facturacion",                  // el mismo nombre que acotaste en la clave
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  service: "api",                              // el subcomponente, si lo hay
  onError: (err) => console.warn("MCLog no disponible:", err.message), // opcional
});
```

> [!IMPORTANT]
> `environment` por defecto es `development`. Si no lo pones, los logs de producción aparecerán como de desarrollo.

## Paso 5 — Envía logs

```ts
import { mclog } from "./mclog";

await mclog.info("Servidor iniciado", { port: 8080 });
await mclog.warn("Caché no disponible, usando la base de datos");
await mclog.error("Stock insuficiente", { productoId: 42 });
```

Cada método recibe el mensaje y, opcionalmente, un objeto de **metadata** con el contexto que necesitarías para diagnosticar: ids, parámetros, tiempos. Devuelve `true` si el servidor lo aceptó.

## Paso 6 — Registra las excepciones como es debido

En los `catch`, usa `captureException` en lugar de meter `err.message` en la metadata:

```ts
try {
  await cobrar(pedido);
} catch (err) {
  await mclog.captureException(err, {
    message: "Fallo al cobrar el pedido",   // opcional: si no, usa el de la excepción
    metadata: { pedidoId: pedido.id },
  });
  throw err; // o gestiona el error como hicieras antes
}
```

Así el log lleva la clase del error (`TypeError`, `TimeoutError`…), su código y su stack. Con eso, cien fallos iguales con ids distintos se ven en **Errores** como **un** grupo con un 100 al lado.

### En una aplicación Express

Un manejador de errores al final de la cadena captura todo lo que se escape:

```ts
import express from "express";
import { mclog } from "./mclog";

const app = express();
// ... tus rutas ...

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void mclog.captureException(err, {
    metadata: { method: req.method, path: req.path },
  });
  res.status(500).json({ error: "Internal Server Error" });
});
```

`void` no espera al envío: la respuesta al usuario no se retrasa por el logging.

## Paso 7 — Procesos masivos: envía en lote

En un job o un ETL, acumula y envía de una vez:

```ts
const entradas = registros.map((r) => ({
  level: "info" as const,
  message: `Registro ${r.id} sincronizado`,
  timestamp: r.procesadoEn.toISOString(), // la hora real del suceso
  metadata: { registroId: r.id },
}));

await mclog.sendBatch(entradas);
```

`sendBatch` trocea solo en peticiones de hasta 500 entradas y 1 MiB, por debajo de los topes del servidor. Pasa `timestamp` cuando envíes más tarde de lo que ocurrió: si no, todos los logs tendrán la hora del envío.

## Paso 8 (opcional) — Correlaciona entre servicios

Si una operación pasa por varios servicios, genera un `traceId` al principio y pásalo a los demás, por ejemplo en una cabecera HTTP. Cada servicio lo incluye en sus logs:

```ts
await mclog.send({ level: "info", message: "Pedido recibido", traceId: req.headers["x-trace-id"] as string });
```

En el dashboard, **Ver traza** mostrará la operación completa, de todos los servicios, en orden.

## Comprueba que funcionó

1. Arranca tu aplicación y provoca un log y una excepción.
2. En el dashboard, **Logs**: filtra por **Aplicación** `facturacion`. Deben aparecer.
3. Abre el log de la excepción: en **Propiedades** verás el error (clase y código) y debajo el **Stack trace**.
4. Provoca la misma excepción varias veces y abre **Errores**: aparece **una** fila con el número de veces.

## Si algo falla

| Síntoma | Causa y solución |
|---|---|
| No llega nada y no ves ningún error | La librería no escribe en consola por defecto. Añade `onError` (paso 4) para ver el motivo |
| `MCLog HTTP 401` | Clave mal copiada, revocada o caducada. Revísala en Espacio → API keys |
| `MCLog HTTP 403` con `allowedApplications` | La clave está acotada a otra aplicación: el `application` del cliente no coincide |
| `MCLog HTTP 400` | Un campo no es válido; el mensaje trae el detalle. Lo más común: `level` o `environment` mal escritos |
| `MCLog HTTP 429` frecuente | Superas 2000 peticiones/minuto. Agrupa con `sendBatch` |
| `fetch failed` / timeout | La URL no es alcanzable desde donde corre tu app. Prueba `curl <URL>/health` desde esa máquina |
| Los errores no se agrupan | Estás enviando `err.message` en la metadata. Usa `captureException` |

Referencia completa de opciones (reintentos, timeouts, concurrencia, validación Express) en el [README de la librería](../../packages/mclog/README.md).

## Siguiente paso

- [Investigar un incidente](investigar-incidente.md): qué hacer con esos errores cuando lleguen.
- [Configurar alertas](configurar-alertas.md): que MCLog te avise cuando aparezca un error nuevo.
