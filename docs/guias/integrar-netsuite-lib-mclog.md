# Integrar NetSuite con lib_mclog.js

`lib_mclog.js` es una librería central de MCLog para SuiteScript 2.1. La subes una vez al File Cabinet y guardas la conexión en un registro personalizado. Después, a cada script solo le falta una línea: envolver sus puntos de entrada. Descárgala, adáptala a tu cuenta y úsala en todos tus scripts de servidor.

**Descargas:** [`lib_mclog.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog.js) (la librería) · [`test_lib_mclog.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/test_lib_mclog.js) (sus pruebas) · [ver el código en GitHub](../../integrations/netsuite/lib_mclog.js)

## Qué vas a conseguir

- **Una sola librería para toda la cuenta**, con la API key fuera del código: cambiarla o apagar MCLog no obliga a tocar ningún script.
- **Una petición HTTPS por ejecución** (10 unidades de governance), registres 1 log o 400.
- **Contexto automático** en cada log: script, deployment, usuario, rol y governance restante. En un User Event, además, el registro que se guarda, con un traceId `invoice:1234` que sigue al documento por todos tus scripts.
- **Excepciones no controladas registradas solas**, sin un `try/catch` en cada punto de entrada.
- **Errores agrupados**: los `SuiteScriptError` se agrupan por su código (`INVALID_FLD_VALUE`, `RCRD_DSNT_EXIST`…), y cien fallos iguales ocupan una fila en **Errores**.
- **Tu script nunca se rompe por MCLog**: si falta la configuración o el servicio no responde, se anota en el Execution Log y el script sigue.

## ¿lib_mclog.js o mclog_client.js?

El repositorio trae dos librerías para NetSuite. Las dos envían al mismo servicio; cambia cómo se configuran y cuándo envían.

| | `lib_mclog.js` (esta guía) | [`mclog_client.js`](integrar-netsuite.md) |
|---|---|---|
| Dónde está la configuración | En un registro personalizado de NetSuite | En constantes dentro del fichero |
| API key | Fuera del código | Escrita en el fichero |
| Cuándo envía | Un lote al terminar cada punto de entrada | Una petición por log, o un lote con `sendBatch` |
| Excepciones no controladas | Se registran solas | `try/catch` a mano |
| traceId por documento | Automático en User Events | A mano |
| Preparación | Crear un registro personalizado | Editar el fichero |
| Úsala para | Varios scripts en la misma cuenta, o un equipo | Un script aislado o una prueba rápida |

## Cómo funciona

```text
Tu script                            lib_mclog.js                            MCLog
---------                            ------------                            -----
mcLog.info(...)           ------>    se guarda en memoria
mcLog.exception(...)      ------>    se guarda en memoria
fin del punto de entrada  ------>    lee la configuración (caché de 5 min)
                                     trocea en lotes de 500 logs / 1 MB  ---> POST /api/logs/batch
```

La configuración solo se lee cuando hay algo que enviar. Un script que no registra nada no gasta ni una unidad de governance.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| MCLog **accesible desde Internet por HTTPS** | NetSuite es SaaS: no alcanza `localhost` ni una IP privada. La librería rechaza las URL `http://`. Ver [Desplegar en un VPS](desplegar-vps.md) |
| Permiso en NetSuite para crear **registros personalizados**, subir ficheros al **File Cabinet** y crear **scripts** | Normalmente, el rol Administrador |
| Una **API key con permiso `ingest`** | El paso 2 explica cómo crearla |

## Paso 1 — Descarga la librería

1. Descarga [`lib_mclog.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog.js). Si el navegador la abre como texto, guárdala con **Ctrl+S** (en Mac, **Cmd+S**).
2. Opcional: descarga también [`test_lib_mclog.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/test_lib_mclog.js) en la misma carpeta. Te servirá para comprobar la librería después de adaptarla (ver [Pruebas](#pruebas)).

## Paso 2 — Crea una API key para NetSuite

1. En el dashboard de MCLog, como dueño del espacio, abre **Espacio → API keys** y rellena el formulario **Nueva clave**.
2. **Nombre**: `NetSuite producción` (o el entorno que corresponda).
3. **Permisos**: solo **Enviar logs**.
4. **Aplicaciones** (recomendado): el nombre que pondrás en el campo **Aplicación** del paso 3, por ejemplo `SuiteApp-Facturacion`.
5. Pulsa **Crear clave**, **cópiala** y pulsa **Ya la he guardado**.

> [!TIP]
> Crea una clave para producción y otra para cada sandbox. Si una se expone, la rotas sin cortar a las demás.

## Paso 3 — Crea el registro de configuración

La librería busca la conexión en un registro personalizado. Créalo una vez por cuenta:

1. En NetSuite: **Customization → Lists, Records, & Fields → Record Types → New**.
2. **Label**: `MCLog Configuración`. **ID**: `_mclog_config` (NetSuite lo guarda como `customrecord_mclog_config`).
3. **Access Type**: **Use Permission List**. Más abajo, en [Quién puede leer el registro](#quién-puede-leer-el-registro), se explica qué roles añadir.
4. Pulsa **Save**. En la pestaña **Fields**, pulsa **New Field** y crea estos cuatro campos:

| Label | ID que escribes | ID que queda | Type | ¿Obligatorio? |
|---|---|---|---|---|
| URL de MCLog | `_mclog_url` | `custrecord_mclog_url` | Free-Form Text | Sí |
| API key | `_mclog_api_key` | `custrecord_mclog_api_key` | Free-Form Text | Sí |
| Aplicación | `_mclog_application` | `custrecord_mclog_application` | Free-Form Text | No |
| Ambiente | `_mclog_environment` | `custrecord_mclog_environment` | Free-Form Text | No |

> [!IMPORTANT]
> No uses el tipo **Password** para la API key. Ese tipo existe para que el valor no se pueda leer en claro, y la librería tiene que leerlo para enviarlo en la cabecera `x-api-key`.

5. Crea el registro con tus valores. En la lista de Record Types, abre **MCLog Configuración** y pulsa **New Record** (o, desde la lista de sus registros, **New**):

| Campo | Qué poner |
|---|---|
| **URL de MCLog** | La URL pública de tu API, p. ej. `https://api-mclog.tu-dominio.com`. Sin barra final. Si pegas la ruta completa (`…/api/logs/batch`), la librería la recorta |
| **API key** | La clave del paso 2 |
| **Aplicación** | El nombre con el que verás estos logs en MCLog, p. ej. `SuiteApp-Facturacion`. Si lo dejas vacío, se usa `NetSuite` |
| **Ambiente** | **Déjalo vacío** (recomendado): se deduce del tipo de cuenta. También acepta `production`, `staging` o `development`, y sus alias (`producción`, `sandbox`, `pruebas`, `dev`…) |

La librería usa el **primer registro activo** que tenga URL y API key. Para apagar MCLog en la cuenta, marca el registro como **Inactive**.

### Por qué dejar el ambiente vacío

Si está vacío, el ambiente sale del tipo de cuenta: una cuenta de producción envía `production`, un sandbox envía `staging` y el resto envía `development`. Así, cuando un refresh del sandbox copia este registro desde producción, los logs del sandbox no llegan marcados como de producción.

> [!WARNING]
> Un refresh del sandbox copia también la **API key de producción**. Después de cada refresh, cambia la clave del sandbox por la suya, o inactiva el registro si no quieres logs de esa cuenta.

### Quién puede leer el registro

La librería lee el registro con SuiteQL y **con el rol de quien ejecuta el script**. En un User Event, es el rol del usuario que guarda el documento. Si ese rol no puede ver el registro, MCLog se desactiva en esa ejecución: el script sigue con normalidad y el Execution Log anota `MCLog: no se pudo leer la configuración`.

| Access Type | Qué implica |
|---|---|
| **Use Permission List** (recomendado) | En la pestaña **Permissions** del Record Type, añade con nivel **View** los roles que ejecutan tus scripts. El resto de roles no ve el registro |
| **No Permission Required** | Funciona con cualquier rol, pero cualquier usuario puede ver la API key |

La configuración se guarda 5 minutos en caché por script, así que este fallo puede ser intermitente: solo aparece cuando la caché está vacía y el primero en ejecutar es un rol sin permiso. Si lo ves en el Execution Log, añade ese rol a la lista.

> [!NOTE]
> La clave solo tiene el permiso **Enviar logs**: con ella se pueden enviar logs a esa aplicación, no leerlos. Aun así, trátala como un secreto. Si se expone, rótala en **Espacio → API keys** y actualiza el registro.

## Paso 4 — Adapta la librería (si hace falta)

Abre `lib_mclog.js`. Todo lo adaptable está en la **sección 1, CONFIGURACIÓN**, al principio del fichero. Si en el paso 3 usaste los mismos ids, no tienes que cambiar nada.

| Constante | Para qué sirve | Valor por defecto |
|---|---|---|
| `SETTINGS_RECORD` | Tipo de registro y ids de sus cuatro campos | `customrecord_mclog_config` |
| `DEFAULT_APPLICATION` | Aplicación que se usa si el campo está vacío | `NetSuite` |
| `SKIP_DEBUG_IN_PRODUCTION` | Si los logs `debug` se descartan en `production` | `true` |
| `SETTINGS_CACHE` | Nombre y duración de la caché de la configuración (N/cache no admite menos de 300 s) | 300 s |

Si tu proyecto ya tiene su propio registro de configuración, no hace falta crear otro. Añádele los cuatro campos y apunta la librería a él:

```js
const SETTINGS_RECORD = {
    type: 'customrecord_mi_proyecto_config',
    fields: {
        url: 'custrecord_mi_proyecto_mclog_url',
        apiKey: 'custrecord_mi_proyecto_mclog_apikey',
        application: 'custrecord_mi_proyecto_mclog_app',
        environment: 'custrecord_mi_proyecto_mclog_env'
    }
};
```

Las secciones 2 (límites) y 3 (governance) están ajustadas a los valores por defecto del servidor MCLog. Solo tienes que tocarlas si tu servidor usa otro `MAX_BATCH_SIZE` o un `BODY_LIMIT` menor de 1 MB.

## Paso 5 — Sube la librería al File Cabinet

1. En NetSuite: **Documents → Files → File Cabinet**.
2. Entra en `SuiteScripts` y crea una carpeta `lib` si no existe.
3. Pulsa **Add File** y sube `lib_mclog.js`.

La ruta final es `/SuiteScripts/lib/lib_mclog.js`. Si la pones en otro sitio, ajusta la ruta del `define` en tus scripts.

> [!TIP]
> Con SuiteCloud Development Framework (SDF), guárdala en `src/FileCabinet/SuiteScripts/lib/` y se despliega con el resto del proyecto. Si tus scripts están en la misma carpeta, también puedes importarla con una ruta relativa: `define(['./lib_mclog'], …)`.

## Paso 6 — Úsala en tus scripts

El patrón es el mismo en todos los tipos de script:

1. Importa la librería en el `define`.
2. Devuelve los puntos de entrada envueltos con `mcLog.wrapEntryPoints({ ... })`.
3. Registra lo que ayude a investigar: `info`, `warn`, y `exception` en los `catch`.

El envoltorio pone el contexto, registra las excepciones que se escapen y envía todo en un lote al terminar.

### User Event

```js
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {

    const afterSubmit = (context) => {
        // El traceId "invoice:<id>" y el tipo de evento ya vienen puestos.
        const invoice = context.newRecord;
        mcLog.info('Factura guardada', { total: invoice.getValue('total') });

        try {
            sendToProvider(invoice); // tu lógica de negocio
        } catch (e) {
            mcLog.exception('Error enviando la factura al proveedor', e, { invoiceId: invoice.id });
            throw e; // opcional: NetSuite marca el fallo y la librería no lo registra dos veces
        }
    };

    return mcLog.wrapEntryPoints({ afterSubmit });
});
```

Si relanzas una excepción que ya registraste, el envoltorio la reconoce y no la cuenta otra vez. Si no la capturas, la registra él como `Error no controlado en afterSubmit` y la relanza.

### Scheduled: un documento en cada vuelta

```js
/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {

    const execute = () => {
        mcLog.setContext({ process: 'reenvio-facturas' }); // va en todos los logs siguientes
        let resent = 0;

        pendingInvoiceIds().forEach((id) => { // tu búsqueda
            // Dentro, los logs llevan el traceId "invoice:<id>"; al salir se restaura el anterior.
            mcLog.withDocument('invoice', id, () => {
                try {
                    resendInvoice(id); // tu lógica de negocio
                    resent++;
                } catch (e) {
                    mcLog.exception('No se pudo reenviar la factura', e);
                }
            });
        });

        mcLog.info('Reenvío terminado', { resent });
    };

    return mcLog.wrapEntryPoints({ execute });
});
```

En un proceso largo, la librería no espera al final: con 200 logs en memoria y más de 200 unidades de governance disponibles, envía lo acumulado.

### Map/Reduce

```js
/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {

    const getInputData = () => {
        // ... tu búsqueda o consulta ...
    };

    const map = (context) => {
        // metadata.key ya viene puesta.
        const order = JSON.parse(context.value);
        mcLog.setDocument('salesorder', order.id);
        syncOrder(order); // si lanza, se registra solo con su stack y NetSuite anota el error de la clave
    };

    const summarize = () => {
        // Al terminar, la librería añade un resumen: usage, segundos,
        // errores por etapa y una muestra de hasta 10 por etapa.
    };

    return mcLog.wrapEntryPoints({ getInputData, map, summarize });
});
```

> [!IMPORTANT]
> Cada invocación de `map` o `reduce` es una ejecución aparte y envía su propio lote. Si cada clave registra un `info`, 10 000 claves son 10 000 peticiones, y chocarán con el límite de ingesta del servidor (2000 por minuto y clave por defecto). En Map/Reduce, registra solo lo excepcional: el resumen de `summarize` ya da los totales.

### Suitelet y RESTlet

```js
/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['/SuiteScripts/lib/lib_mclog'], (mcLog) => {

    const post = (body) => {
        mcLog.setDocument('salesorder', body.orderId);
        mcLog.info('Pedido recibido', { lines: Array.isArray(body.lines) ? body.lines.length : 0 });
        // ... tu lógica ...
        return { ok: true };
    };

    return mcLog.wrapEntryPoints({ post });
});
```

En un Suitelet, el envoltorio añade además el método HTTP (`metadata.method`).

### Sin envoltorio

Un módulo propio que usan tus scripts puede registrar con `mcLog` sin más: sus logs se suman al lote del punto de entrada que lo llama, si ese punto de entrada está envuelto. Si el script no usa `wrapEntryPoints`, llama tú a `flush()` al final:

```js
try {
    // ... tu lógica ...
} finally {
    mcLog.flush();
}
```

## Referencia de la API

| Función | Para qué sirve |
|---|---|
| `debug(message, metadata?, error?)` | Detalle para depurar. No sale de `production` (ver `SKIP_DEBUG_IN_PRODUCTION`) |
| `info(message, metadata?, error?)` | Un hecho normal que conviene poder buscar |
| `warn(message, metadata?, error?)` | Algo raro que no impidió terminar |
| `error(message, metadata?, error?)` | Un fallo sin excepción, p. ej. una respuesta de error de un proveedor |
| `exception(message, error, metadata?)` | Lo capturado en un `catch`. Nivel `error`, y el mensaje queda `"<message>: <error.message>"` |
| `setDocument(type, id)` | Asocia los logs siguientes a un documento (traceId `type:id`) |
| `clearDocument()` | Vuelve al traceId de la ejecución |
| `withDocument(type, id, fn)` | Ejecuta `fn` asociada a un documento y después vuelve al anterior, aunque `fn` falle. `fn` debe ser síncrona |
| `setContext(metadata)` | Añade metadata a todos los logs siguientes de la invocación |
| `wrapEntryPoints(entryPoints)` | Envuelve los puntos de entrada: contexto, excepciones no controladas y envío al final |
| `flush()` | Envía ya lo acumulado. Devuelve `true` si no quedó nada pendiente |
| `errorFields(error)` | Devuelve `{ errorName, errorCode, errorStack }` de una excepción, por si lo necesitas para otro destino |

El tercer argumento de `debug`, `info`, `warn` y `error` guarda la clase y el stack de una excepción sin cambiar el nivel. Sirve, por ejemplo, para una validación que bloquea el guardado y no merece nivel `error`. `exception` lleva el error en segundo lugar, igual que en `mclog_client.js`.

### Qué se añade solo a cada log

| Dónde | Qué se añade | traceId |
|---|---|---|
| Todos los logs | `service` (el scriptId), `host` (`netsuite-<cuenta>`), `timestamp` (el momento del log, no el del envío) y, en metadata: `scriptId`, `deploymentId`, `executionContext`, `accountId`, `envType`, `userId`, `userRole`, `remainingUsage`, `entryPoint`, `executionId` | `exec-<executionId>` |
| User Event y Workflow Action | `recordType`, `eventType` y `recordId` | `<tipo>:<id>`, si el registro ya tiene id |
| Map y Reduce | `key` | — |
| Suitelet (`onRequest`) | `method` | — |
| Scheduled (`execute`) | `invocationType` | — |
| Mass Update (`each`) | `recordType` y `recordId` | `<tipo>:<id>` |
| Un log con excepción | `errorName`, `errorCode` y `errorStack`, más `netsuiteErrorId` en metadata | — |
| `summarize` de un Map/Reduce | Un log de resumen con `usage`, `concurrency`, `yields`, `seconds`, `mapErrors`, `reduceErrors` y `errorSamples` | — |

El `id` de un `SuiteScriptError` cambia en cada ejecución, así que no se usa para agrupar. Se guarda en `metadata.netsuiteErrorId`, que sirve para buscar el error en el Execution Log de NetSuite.

### Qué se protege antes de enviar

- **Credenciales**: el valor de cualquier clave de metadata que contenga `pass`, `contraseña`, `token`, `secret`, `apiKey`, `authorization`, `credential`, `cookie` o `privateKey` se sustituye por `[REDACTED]`, a cualquier profundidad. Solo se miran las claves: no pongas secretos en el texto del mensaje.
- **Volcados grandes**: los textos de más de 30 000 caracteres, los arrays de más de 50 elementos, los objetos de más de 100 claves y lo que pase de 5 niveles de profundidad se recortan. Una excepción dentro de la metadata se reduce a su nombre y su mensaje.
- **Lotes válidos**: `application`, `service` y `traceId` se recortan a los topes del servidor. Si un solo campo los pasara, el servidor rechazaría el lote entero.

## Governance y rendimiento

| Situación | Coste |
|---|---|
| Una ejecución que no registra nada | 0 unidades |
| Una ejecución que registra | 10 unidades por lote (hasta 500 logs o 1 MB) |
| Leer la configuración | Una consulta SuiteQL (10 unidades) cuando caduca la caché, como mucho cada 5 minutos por script |

- **Nunca agota tu governance**: antes de enviar comprueba que queden al menos 20 unidades. Si no quedan, descarta los logs y lo anota en el Execution Log.
- **Memoria acotada**: como mucho guarda 1000 logs pendientes. Si se pasan, descarta los siguientes y envía un aviso con cuántos se perdieron.
- **Sin reintentos**: si MCLog responde `429` o falla la red, ese lote se pierde. Esperar para reintentar gastaría más governance de lo que vale el log.
- **El envío va dentro de la ejecución**: en un User Event, el guardado espera a que MCLog responda, y NetSuite no permite fijar un timeout en `N/https`. Un servidor MCLog lento se nota al guardar.

## Comprueba que funcionó

1. Provoca una ejecución: guarda un registro (User Event), lanza el Scheduled o el Map/Reduce.
2. En MCLog, abre **Logs** y filtra por la **Aplicación** del registro de configuración.
3. Abre un log. En **Metadata** verás `scriptId`, `deploymentId`, `userRole`, `remainingUsage`… En un User Event, el traceId es `invoice:<id>`: pulsa **Ver traza** para ver la historia completa del documento en todos tus scripts.
4. Si hubo excepciones, abre **Errores**: los fallos repetidos aparecen agrupados por su código.

## Si algo falla

La librería **nunca rompe tu script**: cuando algo va mal, lo anota en el **Execution Log** del script y sigue. Pon el **Log Level** del deployment en **Audit** o **Debug** para ver también los avisos de nivel audit.

| En el Execution Log | Causa y solución |
|---|---|
| `MCLog desactivado: No hay ningún customrecord_mclog_config activo con URL y API key` | Falta el registro, está inactivo o le falta la URL o la clave (paso 3). Después de corregirlo, tarda hasta 5 minutos en aplicarse |
| `MCLog desactivado: La URL … debe empezar por https://` | La URL es `http://`. La clave no viaja sin cifrar |
| `MCLog: no se pudo leer la configuración` | El rol que ejecuta no tiene permiso sobre el registro, o los ids de `SETTINGS_RECORD` no coinciden con los del registro. Se reintenta cada minuto |
| `HTTP 401` | Clave mal copiada, revocada o caducada |
| `HTTP 403` | La clave no tiene el permiso **Enviar logs** o está acotada a otras aplicaciones: revisa el campo **Aplicación** |
| `HTTP 400` | Un campo no es válido. Con esta librería es raro: comprueba que el servidor no tenga topes menores que los de la sección 2 |
| `HTTP 413` | El `BODY_LIMIT` del servidor es menor de 1 MB: baja `MAX_BATCH_BYTES` en la sección 2 |
| `HTTP 429` | Límite de ingesta superado. Registra menos por clave en Map/Reduce, o sube `INGEST_RATE_LIMIT_MAX` en el servidor |
| `MCLog: error de red` | MCLog no es accesible por HTTPS desde Internet, o su certificado no es válido |
| `MCLog: sin governance para enviar` | El script agotó su governance y los logs de esa ejecución se perdieron |
| No hay nada ni en el Execution Log ni en MCLog | Sin logs, la librería no hace nada. Comprueba que el script registró algo (en producción, `debug` no sale), que el deployment se ejecutó (estado, audiencia, contexto) y que devuelves los puntos de entrada envueltos |

## Pruebas

`test_lib_mclog.js` prueba la librería fuera de NetSuite: simula `define()` y los módulos `N/https`, `N/log`, `N/runtime`, `N/query` y `N/cache`, y comprueba lo que saldría por el cable (114 comprobaciones). No necesita dependencias ni una cuenta de NetSuite. Con los dos ficheros en la misma carpeta:

```bash
node test_lib_mclog.js
```

Pásalas después de adaptar la librería: leen de ella misma el registro, la aplicación por defecto y `SKIP_DEBUG_IN_PRODUCTION`, así que siguen valiendo con tus cambios. En este repositorio corren en CI con cada cambio.

No cubren lo que depende del runtime real: la governance de verdad, los permisos de SuiteQL, la caducidad de `N/cache` o un `SuiteScriptError` auténtico. Eso solo se ve en una cuenta. Pruébalo primero en un sandbox.

## Siguiente paso

- [Configurar alertas](configurar-alertas.md) para enterarte de un error nuevo sin mirar el dashboard.
- [Investigar un incidente](investigar-incidente.md): de un error agrupado a la traza completa del documento.
