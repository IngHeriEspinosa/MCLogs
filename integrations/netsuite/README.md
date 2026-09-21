# Integración MCLog ↔ NetSuite (SuiteScript 2.1)

Envía los logs de todos tus scripts de NetSuite al servicio centralizado MCLog con una librería reutilizable.

## Archivos

| Archivo | Descripción |
|---|---|
| `mclog_client.js` | Módulo SuiteScript 2.1 reutilizable (el único que necesitas subir) |
| `ejemplo_user_event.js` | Ejemplo de uso en un User Event Script |
| `ejemplo_map_reduce.js` | Ejemplo de uso en Map/Reduce con envío en lote |
| `test_mclog_client.js` | Pruebas del módulo fuera de NetSuite (`node test_mclog_client.js`) |

## Instalación (5 minutos)

1. **Sube la librería al File Cabinet**
   - Documents → Files → File Cabinet → `SuiteScripts/lib/`
   - Sube `mclog_client.js`.

2. **Configura la librería** — edita las dos constantes al inicio del archivo:
   ```js
   const MCLOG_URL = 'https://tu-servidor-mclog.com'; // URL pública de tu API MCLog
   const MCLOG_API_KEY = 'tu-api-key';                // el valor de API_KEY del backend
   ```
   > La API key es la variable `API_KEY` del `.env` del backend MCLog. En producción usa una clave larga y aleatoria.

3. **Úsala en cualquier script**:
   ```js
   define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
       const appLog = mclog.createLogger({
           application: 'MiSuiteApp',
           environment: 'production'
       });

       appLog.info('Proceso iniciado');
       appLog.error('Algo falló', { recordId: 123, error: 'detalle' });
   });
   ```

## API de la librería

### `createLogger(defaults)` — recomendado
Crea un logger preconfigurado con `application` y `environment`:
```js
const appLog = mclog.createLogger({ application: 'MiApp', environment: 'production' });
appLog.debug(mensaje, metadata?);
appLog.info(mensaje, metadata?);
appLog.warn(mensaje, metadata?);
appLog.error(mensaje, metadata?);
appLog.exception(mensaje, error, metadata?);   // para bloques catch
appLog.batch([{ level: 'info', message: '...' }, ...]);
```

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
    metadata: { cualquier: 'dato' } // opcional
});
```

### `sendBatch(entries)` — lote
Ideal en **Map/Reduce** y **Scheduled Scripts**: acumula los logs en un array y envíalos en `summarize` en lugar de uno a uno.

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

Simula `define()` y los módulos `N/https`, `N/log` y `N/runtime`, y comprueba el payload que saldría por el cable: troceo de lotes, reparto de excepciones y contexto automático. No necesita dependencias ni una cuenta de NetSuite, y corre en CI.

Lo que no cubre: todo lo que dependa del runtime real (governance, límites de `https`, comportamiento de un `SuiteScriptError` de verdad). Eso solo se ve en una cuenta.

## Requisitos del lado MCLog

- El backend debe estar accesible por HTTPS desde internet (NetSuite es SaaS).
- La ingesta usa el header `x-api-key` contra `POST /api/log` y `POST /api/logs/batch` — no requiere usuarios ni JWT.
- Límite de ingesta por defecto: 2000 peticiones/minuto (configurable con `INGEST_RATE_LIMIT_MAX`).
