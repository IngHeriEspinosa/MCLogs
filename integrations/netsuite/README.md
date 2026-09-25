# Integración MCLog ↔ NetSuite (SuiteScript 2.1)

Envía los logs de todos tus scripts de NetSuite al servicio centralizado MCLog con una librería reutilizable.

## Archivos

| Archivo | Descripción |
|---|---|
| `mclog_client.js` | Módulo SuiteScript 2.1 reutilizable (el único que necesitas subir) |
| `ejemplo_user_event.js` | Ejemplo de uso en un User Event Script |
| `ejemplo_map_reduce.js` | Ejemplo de uso en Map/Reduce con envío en lote |
| `test_mclog_client.js` | Pruebas del módulo fuera de NetSuite (`node test_mclog_client.js`) |
| `lib_mclog.js` | Librería central alternativa: configuración en un registro personalizado, un lote por ejecución, errores no controlados automáticos |
| `test_lib_mclog.js` | Pruebas de `lib_mclog.js` fuera de NetSuite (`node test_lib_mclog.js`) |

> **¿Varios scripts en la misma cuenta?** Usa `lib_mclog.js`: la API key vive en un registro de NetSuite y no en el código, cada ejecución envía un solo lote y basta con envolver los puntos de entrada (`return mcLog.wrapEntryPoints({ afterSubmit })`). Instalación, ejemplos por tipo de script y referencia completa en [Integrar NetSuite con lib_mclog.js](../../docs/guias/integrar-netsuite-lib-mclog.md). El resto de este README describe `mclog_client.js`.

## Instalación (5 minutos)

> La misma instalación, detallada y con comprobaciones en cada paso: [Integrar NetSuite paso a paso](../../docs/guias/integrar-netsuite.md).

1. **Crea una API key para NetSuite** en el dashboard de MCLog:
   1. Entra con un usuario admin y abre **Administración → API keys → Nueva clave**.
   2. Ponle un **Nombre** reconocible (por ejemplo, `NetSuite producción`).
   3. Marca solo el permiso **Enviar logs** (`ingest`).
   4. Opcionalmente, en **Aplicaciones**, acótala a los nombres de aplicación que vas a usar.
   5. Pulsa **Crear clave** y **cópiala ahora**: es la única vez que se muestra.

   > No uses la variable `API_KEY` del backend: está deprecada, es la misma para todos los emisores y no se puede acotar ni rotar sin cortarlos a todos.

2. **Configura la librería**: edita las constantes al inicio de `mclog_client.js`:
   ```js
   const MCLOG_URL = 'https://tu-servidor-mclog.com'; // URL pública de tu API MCLog, sin barra final
   const MCLOG_API_KEY = 'mclog_...';                 // la clave del paso 1
   const DEFAULT_ENVIRONMENT = 'production';          // entorno si una llamada no indica otro
   ```

3. **Sube la librería al File Cabinet**:
   - Documents → Files → File Cabinet → `SuiteScripts/lib/`
   - Sube `mclog_client.js`.

4. **Úsala en cualquier script**:
   ```js
   define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
       const appLog = mclog.createLogger({
           application: 'MiSuiteApp',
           environment: 'production'
       });

       appLog.info('Proceso iniciado', { recordId: 123 });

       try {
           // ...
       } catch (e) {
           appLog.exception('Fallo al crear la factura', e, { recordId: 123 });
       }
   });
   ```

5. **Comprueba** en el dashboard, en **Logs**, filtrando por la aplicación `MiSuiteApp`, que llegan los registros.

## API de la librería

### `createLogger(defaults)` — recomendado
Crea un logger preconfigurado con `application` y `environment`:
```js
const appLog = mclog.createLogger({ application: 'MiApp', environment: 'production' });
appLog.debug(mensaje, metadata?, extra?);
appLog.info(mensaje, metadata?, extra?);
appLog.warn(mensaje, metadata?, extra?);
appLog.error(mensaje, metadata?, extra?);
appLog.exception(mensaje, error, metadata?, extra?);   // para bloques catch
appLog.batch([{ level: 'info', message: '...' }, ...]);
```

`extra` sobrescribe los valores por defecto del logger solo en esa llamada, por
ejemplo `{ traceId: 'pedido-42', service: 'facturacion' }`.

### `exception(mensaje, error, metadata?)` — para los `catch`

```js
try {
    // ...
} catch (e) {
    appLog.exception('Fallo al crear la factura', e, { recordId: id });
}
```

Extrae la clase del error y su stack a campos propios, y con eso MCLog **agrupa
las repeticiones del mismo fallo en un solo error** en lugar de en uno por cada
registro procesado. En el dashboard aparece una línea con el número de veces que
ha ocurrido, en vez de cien líneas iguales.

En un `SuiteScriptError` el código estable está en `name` (`INVALID_FLD_VALUE`,
`RCRD_DSNT_EXIST`…) y es el que se usa para agrupar. El `stack` de NetSuite llega
como array de marcos y se une en una cadena. El `id` de la excepción **no** se usa
para agrupar, porque cambia en cada ejecución y convertiría cada ocurrencia en un
grupo propio; se guarda en `metadata.netsuiteErrorId`, donde sirve para cruzar con
el registro de ejecución de NetSuite.

### `send(level, opts)` — llamada individual
```js
mclog.send('error', {
    application: 'MiApp',          // obligatorio
    message: 'Descripción',        // obligatorio
    environment: 'production',     // opcional (default en la librería)
    service: 'nombre_del_script',  // opcional (default: scriptId actual)
    traceId: 'id-de-correlacion',  // opcional
    metadata: { cualquier: 'dato' }, // opcional
    error: e,                      // opcional: excepción capturada (se reparte en los campos de error)
    errorName: 'MI_ERROR',         // opcional: manda sobre el de `error`
    errorCode: 'E42',              // opcional
    errorStack: '...'              // opcional
});
```

Si falta `message`, se usa el de `error`. `environment` cae en la constante
`DEFAULT_ENVIRONMENT` (`production`), **no** en `development` como la librería npm.

La librería **no envía** `fingerprint`, `spanId` ni `timestamp`, aunque los pongas: la
huella la calcula el servidor y la hora es la de llegada. Tampoco recorta campos: el
servidor recorta los largos por su cuenta.

### `errorFields(error)`

Devuelve `{ errorName, errorCode, errorStack }` de una excepción (solo los que existan),
con el stack de NetSuite ya unido en una cadena. Útil si quieres el mismo reparto para
otro destino.

### `sendBatch(entries)` — lote
Ideal en **Map/Reduce** y **Scheduled Scripts**: acumula los logs en un array y envíalos en `summarize` en lugar de uno a uno. Cada entrada acepta los mismos campos que `send`, más `level` (por defecto `info`).

> En `summarize`, NetSuite entrega los errores de `mapSummary`/`reduceSummary` **serializados como JSON**. Haz `JSON.parse` y pásalos en `error`, no dentro de `metadata`: así MCLog agrupa las repeticiones. Lo tienes resuelto en `ejemplo_map_reduce.js`.

Se trocea solo, en lotes de como mucho 500 entradas (el `MAX_BATCH_SIZE` del servidor) y 1 MB (por debajo de los 3 MB de su `BODY_LIMIT`). Importa: el servidor rechaza **entero** el lote que pase de cualquiera de los dos topes, con `400` o con `413`. Un `summarize` que acumula una entrada por clave fallida pasa de 500 con facilidad, y 500 errores con stacks de unos 7 KB ya pesan 4 MB: sin trocear se perdían todos los logs de esa ejecución. Una entrada que por sí sola pase de 1 MB viaja en una petición propia, para que si el servidor la rechaza no arrastre a las demás.

El coste de governance va por peticiones, no por entradas: `ceil(N / 500) × 10` unidades, y alguna petición más si las entradas son grandes. 10 000 entradas pequeñas son 200 unidades.

## Contexto automático

Cada log incluye automáticamente en `metadata`: `scriptId`, `deploymentId`, `executionContext`, `accountId`, `userId`, `userRole` y `remainingUsage`. El campo `host` se rellena como `netsuite-<accountId>`.

## Garantías de diseño

- **Nunca rompe tu script**: los errores de red/API se capturan y se registran con `N/log`; la función devuelve `false` y tu lógica de negocio continúa.
- **Governance**: `https.post` cuesta 10 unidades por llamada en la mayoría de scripts. Usa `sendBatch`/`appLog.batch` en procesos masivos: agrupa de 500 en 500 en lugar de una llamada por log.
- **Sin reintento**: una respuesta `429` del limitador de ingesta se registra con `N/log` y se pierde ese lote. SuiteScript no tiene forma de esperar sin quemar governance, así que reintentar aquí costaría más de lo que salva. Si lo ves a menudo, sube `INGEST_RATE_LIMIT_MAX` en el servidor.
- **Client Scripts (navegador)**: `N/https` no está disponible del lado cliente para dominios externos sin CORS. Para logs desde Client Scripts, expón MCLog con CORS habilitado para tu dominio de NetSuite o registra vía un Suitelet proxy.

## Pruebas

```bash
node integrations/netsuite/test_mclog_client.js
```

Simula `define()` y los módulos `N/https`, `N/log` y `N/runtime`, y comprueba el payload que saldría por el cable: troceo de lotes, reparto de excepciones y contexto automático (40 comprobaciones). No necesita dependencias ni una cuenta de NetSuite, y corre en CI.

Lo que no cubre: todo lo que dependa del runtime real (governance, límites de `https`, comportamiento de un `SuiteScriptError` de verdad). Eso solo se ve en una cuenta.

## Requisitos del lado MCLog

- El backend debe estar accesible por HTTPS desde internet (NetSuite es SaaS).
- La ingesta usa el header `x-api-key` contra `POST /api/log` y `POST /api/logs/batch`, con una clave de permiso `ingest`. No requiere usuarios ni JWT.
- Si la clave está acotada a ciertas aplicaciones, un log de otra aplicación devuelve `403` y se registra con `N/log`.
- Límite de ingesta por defecto: 2000 peticiones/minuto (configurable con `INGEST_RATE_LIMIT_MAX`).
