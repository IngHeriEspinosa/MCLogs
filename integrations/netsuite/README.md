# Integración MCLog ↔ NetSuite (SuiteScript 2.1)

Envía los logs de todos tus scripts de NetSuite al servicio centralizado MCLog con una librería reutilizable.

## Archivos

| Archivo | Descripción |
|---|---|
| `mclog_client.js` | Módulo SuiteScript 2.1 reutilizable (el único que necesitas subir) |
| `ejemplo_user_event.js` | Ejemplo de uso en un User Event Script |
| `ejemplo_map_reduce.js` | Ejemplo de uso en Map/Reduce con envío en lote |

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

### `sendBatch(entries)` — lote (hasta 500 logs por llamada)
Ideal en **Map/Reduce** y **Scheduled Scripts**: acumula los logs en un array y envíalos con una sola llamada HTTPS en `summarize` — consume 1 unidad de governance en lugar de N.

## Contexto automático

Cada log incluye automáticamente en `metadata`: `scriptId`, `deploymentId`, `executionContext`, `accountId`, `userId`, `userRole` y `remainingUsage`. El campo `host` se rellena como `netsuite-<accountId>`.

## Garantías de diseño

- **Nunca rompe tu script**: los errores de red/API se capturan y se registran con `N/log`; la función devuelve `false` y tu lógica de negocio continúa.
- **Governance**: `https.post` cuesta 10 unidades por llamada en la mayoría de scripts. Usa `sendBatch`/`appLog.batch` en procesos masivos.
- **Client Scripts (navegador)**: `N/https` no está disponible del lado cliente para dominios externos sin CORS. Para logs desde Client Scripts, expón MCLog con CORS habilitado para tu dominio de NetSuite o registra vía un Suitelet proxy.

## Requisitos del lado MCLog

- El backend debe estar accesible por HTTPS desde internet (NetSuite es SaaS).
- La ingesta usa el header `x-api-key` contra `POST /api/log` y `POST /api/logs/batch` — no requiere usuarios ni JWT.
- Límite de ingesta por defecto: 2000 peticiones/minuto (configurable con `INGEST_RATE_LIMIT_MAX`).
