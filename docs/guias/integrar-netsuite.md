# Integrar NetSuite

Envía los logs y los errores de tus scripts de NetSuite (SuiteScript 2.1) a MCLog con la librería incluida en el proyecto.

## Qué vas a conseguir

- Tus User Events, Scheduled, Map/Reduce, Suitelets y RESTlets envían logs a MCLog con una línea.
- Cada log lleva automáticamente el contexto de NetSuite: script, deployment, contexto de ejecución, cuenta, usuario, rol y **governance restante**.
- Los `SuiteScriptError` se agrupan por su código (`INVALID_FLD_VALUE`, `RCRD_DSNT_EXIST`…), así que cien fallos iguales son una fila en **Errores**.
- Si MCLog no responde, tu script sigue: la librería nunca lanza excepciones.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| MCLog **accesible desde Internet por HTTPS** | NetSuite es SaaS: no alcanza `localhost` ni una IP privada. Ver [Desplegar en un VPS](desplegar-vps.md) |
| Permiso en NetSuite para subir ficheros al **File Cabinet** y crear scripts | — |
| Una **API key con permiso `ingest`** | El paso 1 explica cómo crearla |
| El fichero [`integrations/netsuite/mclog_client.js`](../../integrations/netsuite/mclog_client.js) | Está en el repositorio |

## Paso 1 — Crea una API key para NetSuite

1. En el dashboard de MCLog, con un usuario admin, abre **Espacio → API keys** y pulsa **Nueva clave**.
2. **Nombre**: `NetSuite producción` (o el entorno que corresponda).
3. **Permisos**: solo **Enviar logs**.
4. **Aplicaciones** (recomendado): los nombres que usarás en `application`, separados por comas, por ejemplo `SuiteApp-Facturacion, SuiteApp-SyncInventario`.
5. Pulsa **Crear clave**, **cópiala** y pulsa **Ya la he guardado**.

> [!WARNING]
> No uses la variable `API_KEY` del backend. Está deprecada, es la misma para todos los emisores y no se puede acotar ni rotar sin cortarlos a todos.

## Paso 2 — Configura la librería

Abre `mclog_client.js` y edita las constantes del principio:

```js
// ====== CONFIGURACIÓN ======
const MCLOG_URL = 'https://api-mclog.tu-dominio.com'; // sin barra final
const MCLOG_API_KEY = 'mclog_...';                    // la clave del paso 1
const DEFAULT_ENVIRONMENT = 'production';             // development | staging | production
// ===========================
```

`DEFAULT_ENVIRONMENT` es el entorno que se usa cuando una llamada no indica otro. En una cuenta sandbox, ponlo en `staging`.

> [!TIP]
> La clave queda dentro del fichero. Restringe quién puede ver esa carpeta del File Cabinet, y usa una clave distinta para el sandbox y para producción.

## Paso 3 — Sube la librería al File Cabinet

1. En NetSuite: **Documents → Files → File Cabinet**.
2. Entra en `SuiteScripts` y crea una carpeta `lib` si no existe.
3. Pulsa **Add File** y sube `mclog_client.js`.

La ruta final es `/SuiteScripts/lib/mclog_client.js`. Si la pones en otro sitio, ajusta la ruta del `define` en tus scripts.

## Paso 4 — Úsala en un script

Ejemplo en un User Event (el repositorio incluye uno completo en [`ejemplo_user_event.js`](../../integrations/netsuite/ejemplo_user_event.js)):

```js
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['/SuiteScripts/lib/mclog_client'], (mclog) => {

    const appLog = mclog.createLogger({
        application: 'SuiteApp-Facturacion',
        environment: 'production'
    });

    const afterSubmit = (context) => {
        try {
            const record = context.newRecord;
            appLog.info(`Factura ${record.id} guardada`, { recordId: record.id, eventType: context.type });

            // ... tu lógica ...

        } catch (e) {
            // exception() reparte la clase y el stack del error: MCLog agrupa las repeticiones
            appLog.exception('Fallo en afterSubmit de factura', e, {
                recordId: context.newRecord && context.newRecord.id
            });
            throw e;
        }
    };

    return { afterSubmit };
});
```

Los métodos del logger son `debug`, `info`, `warn`, `error` (mensaje y metadata) y `exception` (mensaje, error y metadata). Para los `catch`, usa siempre `exception`.

## Paso 5 — Procesos masivos: Map/Reduce

En un Map/Reduce, no envíes un log por clave: **acumula y envía en lote en `summarize`**. Cada petición HTTPS gasta 10 unidades de governance, y un lote de 500 cuesta lo mismo que un log suelto.

```js
const summarize = (summary) => {
    const entries = [{
        level: 'info', ...APP,
        message: 'Map/Reduce finalizado',
        metadata: { usage: summary.usage, seconds: summary.seconds, yields: summary.yields }
    }];

    summary.mapSummary.errors.iterator().each((key, error) => {
        let parsed;
        try { parsed = JSON.parse(error); } catch (e) { parsed = { message: String(error) }; }
        entries.push({ level: 'error', ...APP, message: `Error en map para clave ${key}`, error: parsed, metadata: { key } });
        return true;
    });

    mclog.sendBatch(entries);
};
```

> [!IMPORTANT]
> En `summarize`, NetSuite entrega los errores **serializados como JSON**. Haz `JSON.parse` y pásalo en `error`, no dentro de `metadata`: si no, no se agrupan. El ejemplo completo está en [`ejemplo_map_reduce.js`](../../integrations/netsuite/ejemplo_map_reduce.js).

`sendBatch` trocea solo en peticiones de hasta 500 entradas y 1 MB.

## Paso 6 — Despliega el script

Como cualquier script de NetSuite: **Customization → Scripting → Scripts → New**, elige el fichero, crea el registro del script y su **Deployment** con el estado y la audiencia adecuados.

## Comprueba que funcionó

1. Provoca la ejecución: guarda un registro (User Event) o lanza el Map/Reduce.
2. En MCLog, **Logs**: filtra por **Aplicación** `SuiteApp-Facturacion`. Deben aparecer los logs.
3. Abre uno: en **Metadata** verás `scriptId`, `deploymentId`, `executionContext`, `accountId`, `userId`, `userRole` y `remainingUsage`. El **host** es `netsuite-<accountId>`.
4. Si hubo excepciones, abre **Errores**: los fallos repetidos aparecen agrupados por su código.

> [!TIP]
> El `id` de un `SuiteScriptError` cambia en cada ejecución, así que no se usa para agrupar. Se guarda en `metadata.netsuiteErrorId`, que sirve para buscarlo en el registro de ejecución de NetSuite.

## Si algo falla

La librería **nunca rompe tu script**: cuando un envío falla, lo registra con `N/log` y sigue. Mira el **Execution Log** del script en NetSuite para ver el motivo.

| En el Execution Log | Causa y solución |
|---|---|
| `401` | Clave mal copiada, revocada o caducada |
| `403` con `allowedApplications` | La clave está acotada a otras aplicaciones: revisa `application` |
| `400` | Un campo no es válido. Lo más común: `environment` con un valor que no es `development`, `staging` ni `production` |
| `429` | Límite de ingesta superado. La librería **no reintenta** (esperar quemaría governance): usa lotes con `sendBatch` |
| Error de conexión o SSL | MCLog no es accesible por HTTPS desde Internet, o su certificado no es válido |
| No aparece nada en el Execution Log ni en MCLog | El script no llegó a ejecutarse: revisa el Deployment (estado, audiencia, contexto) |

**Client Scripts:** `N/https` no puede llamar a dominios externos desde el navegador. Para logs de Client Scripts, envíalos a un Suitelet propio que los reenvíe con esta librería.

Más detalle de la API de la librería en su [README](../../integrations/netsuite/README.md).

## Siguiente paso

- [Configurar alertas](configurar-alertas.md) para enterarte de un error nuevo sin mirar el dashboard.
- [Investigar un incidente](investigar-incidente.md).
