# NetSuite para consultores: recetario de logs

Esta guía es para quien implanta y personaliza NetSuite sin ser programador de oficio: consultores funcionales, administradores y quien escribe un script de vez en cuando. Reúne siete recetas, una por situación habitual. Cada una trae un script completo que descargas, adaptas cambiando unos pocos valores y subes a tu cuenta.

Todas usan la misma pieza central, [`lib_mclog.js`](integrar-netsuite-lib-mclog.md). Se instala una vez por cuenta y, a partir de ahí, cada script solo llama a funciones como `mcLog.info(...)` o `mcLog.exception(...)`. La librería se encarga del resto: la API key, el envío en lote, el contexto de NetSuite y los errores que se escapan.

**Descargas:** [carpeta de ejemplos en GitHub](../../integrations/netsuite/examples/) · [`lib_mclog.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog.js) · [`lib_mclog_browser.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog_browser.js) (solo para la receta 7)

## Las recetas de un vistazo

| # | Ámbito | Situación | Tipo de script | Fichero |
|---|---|---|---|---|
| 1 | Integraciones | [Enviar una factura a un proveedor externo](#receta-1--enviar-una-factura-a-un-proveedor-externo) | User Event | [`ue_invoice_send_to_provider.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ue_invoice_send_to_provider.js) |
| 2 | Integraciones | [Recibir pedidos de un e-commerce](#receta-2--recibir-pedidos-de-un-e-commerce) | RESTlet | [`rl_order_intake.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/rl_order_intake.js) |
| 3 | Validaciones | [Bloquear un pedido que no cumple una regla](#receta-3--bloquear-un-pedido-que-no-cumple-una-regla) | User Event | [`ue_sales_order_rules.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ue_sales_order_rules.js) |
| 4 | Validaciones | [Decidir la ruta de aprobación de un workflow](#receta-4--decidir-la-ruta-de-aprobación-de-un-workflow) | Workflow Action | [`wa_approval_route.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/wa_approval_route.js) |
| 5 | Procesos masivos | [Recordatorios de facturas vencidas](#receta-5--recordatorios-de-facturas-vencidas) | Scheduled | [`ss_overdue_invoice_reminders.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ss_overdue_invoice_reminders.js) |
| 6 | Procesos masivos | [Importar clientes desde un CSV](#receta-6--importar-clientes-desde-un-csv) | Map/Reduce | [`mr_customer_import.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/mr_customer_import.js) |
| 7 | Formularios | [Errores de un formulario en el navegador](#receta-7--errores-de-un-formulario-en-el-navegador) | Client Script + Suitelet | [`cs_sales_order_form.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/cs_sales_order_form.js) y [`sl_mclog_browser_proxy.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/sl_mclog_browser_proxy.js) |

Si el navegador abre un fichero como texto en lugar de descargarlo, guárdalo con **Ctrl+S** (en Mac, **Cmd+S**).

## Antes de empezar

Necesitas `lib_mclog.js` instalada y funcionando en la cuenta. Se hace una vez por cuenta, en tres pasos de la guía [Integrar NetSuite con lib_mclog.js](integrar-netsuite-lib-mclog.md):

| Qué haces | Resultado | Dónde se explica |
|---|---|---|
| Crear una API key en MCLog | Una clave con el permiso **Enviar logs** | [Paso 2](integrar-netsuite-lib-mclog.md#paso-2--crea-una-api-key-para-netsuite) |
| Crear el registro de configuración | `customrecord_mclog_config` con la URL, la clave y el nombre de la aplicación | [Paso 3](integrar-netsuite-lib-mclog.md#paso-3--crea-el-registro-de-configuración) |
| Subir la librería | `/SuiteScripts/lib/lib_mclog.js` en el File Cabinet | [Paso 5](integrar-netsuite-lib-mclog.md#paso-5--sube-la-librería-al-file-cabinet) |

> [!IMPORTANT]
> En el campo **URL de MCLog** va la URL de la **API**, sin nada detrás: `https://api-mclog.tu-dominio.com`. No copies la del panel **Conectar una IA**, que termina en `/mcp`. Con ella, cada envío llega a `/mcp/api/logs/batch`, MCLog responde `404` y los logs se pierden.

Los roles que ejecutan tus scripts necesitan permiso **View** sobre el registro de configuración: en un User Event, el rol del usuario que guarda. Lo explica [Quién puede leer el registro](integrar-netsuite-lib-mclog.md#quién-puede-leer-el-registro).

## Cómo está hecho cada ejemplo

Todos los scripts tienen la misma forma. Conocerla te dice qué puedes tocar sin miedo:

```js
/**
 * @NApiVersion 2.1                 // versión de SuiteScript: no la cambies
 * @NScriptType UserEventScript     // tipo de script
 *
 * QUÉ REGISTRA EN MCLOG            // qué verás en MCLog, log por log
 * CÓMO INSTALARLO                  // parámetros y opciones del deployment
 */
define(['N/https', 'N/runtime', '/SuiteScripts/lib/lib_mclog'], (https, runtime, mcLog) => {

    // CONFIGURACIÓN — lo que puedes adaptar
    const PARAMS = { url: 'custscript_mcl_prov_url' };   // ids de los parámetros del Script

    // LÓGICA
    const afterSubmit = (context) => {
        mcLog.info('Factura enviada al proveedor', { httpStatus: 200 });
    };

    // Envía los logs al terminar y registra los errores que se escapen.
    return mcLog.wrapEntryPoints({ afterSubmit });
});
```

- **La cabecera** explica qué hace el script, qué registra y cómo se instala. Léela antes de subirlo.
- **`define`** lista los módulos que usa el script. `/SuiteScripts/lib/lib_mclog` es MCLog: si subiste la librería a otra carpeta, cambia esa ruta.
- **CONFIGURACIÓN** es lo único que sueles tener que tocar. Casi todo lo que cambia entre cuentas (URLs, límites, remitentes) va en **parámetros del Script**, que se rellenan en el Deployment sin editar el código.
- **`mcLog.wrapEntryPoints`** va en la última línea. No lo quites: sin él, los logs no se envían.

## Instalar una receta paso a paso

Los pasos son los mismos para las siete. Cada receta dice qué parámetros crear y qué opciones elegir.

### 1. Descarga y revisa el script

Descárgalo desde la tabla de arriba y ábrelo con cualquier editor de texto (el Bloc de notas sirve, VS Code es más cómodo). Lee la cabecera y la sección **CONFIGURACIÓN**.

### 2. Súbelo al File Cabinet

1. En NetSuite: **Documents → Files → File Cabinet**.
2. Entra en `SuiteScripts` y crea una carpeta para tus scripts, por ejemplo `mclog-recetas`.
3. Pulsa **Add File** y sube el script.

### 3. Crea el Script

1. **Customization → Scripting → Scripts → New**.
2. En **Script File**, elige el fichero que subiste y pulsa **Create Script Record**.
3. Pon un **Name** reconocible y un **ID**, por ejemplo `_mcl_invoice_provider`.
4. En la pestaña **Parameters**, crea los parámetros de la tabla de la receta, con el mismo ID y el mismo tipo.
5. Pulsa **Save**.

> [!TIP]
> NetSuite añade el prefijo a los IDs: `customscript` al Script, `customdeploy` al Deployment y `custscript` al parámetro. En esta guía verás el ID completo, `custscript_mcl_prov_url`. Al crearlo, escribe solo lo que va detrás: `_mcl_prov_url`.

### 4. Crea el Deployment

Desde el Script, pulsa **Deploy Script**:

| Campo | Mientras pruebas | En producción |
|---|---|---|
| **Applies To** | El tipo de registro de la receta (User Event, Client Script y Workflow Action) | Igual |
| **Status** | **Testing**: solo se ejecuta para ti. En Scheduled y Map/Reduce, **Not Scheduled** | **Released** (o **Scheduled** con su horario) |
| **Log Level** | **Debug** | **Error** |
| **Audience** | Tu rol | Los roles que deben ejecutarlo |
| Pestaña **Parameters** | Los valores de la receta | Igual |

El **Log Level** solo afecta al Execution Log de NetSuite, no a MCLog. Con **Debug** verás ahí los avisos de la librería si algo falla.

### 5. Pruébalo y comprueba en MCLog

1. Provoca la ejecución: guarda un registro, llama al RESTlet o pulsa **Save and Execute** en el Deployment.
2. En MCLog, abre **Logs** y filtra por la **Aplicación** del registro de configuración. El **Servicio** de cada log es el ID del Script (`customscript_...`).
3. Abre un log: en **Metadata** verás lo que registró la receta y el contexto que añade la librería (script, deployment, usuario, rol, governance restante).
4. Si no aparece nada, mira el **Execution Log** del Script en NetSuite y la sección [Si algo falla](#si-algo-falla).

### 6. Pásalo a producción

Cuando funcione, cambia el Deployment a **Released**, baja el **Log Level** a **Error** y añade los roles que deben ejecutarlo. Repasa antes la [lista de comprobación](#antes-de-pasar-a-producción).

## Cinco reglas para registrar bien

Un log sirve si, meses después, alguien que no escribió el script entiende qué pasó. Las siete recetas siguen estas reglas.

### 1. Elige el nivel por lo que significa

| Nivel | Cuándo | Ejemplo de estas recetas |
|---|---|---|
| `debug` | Detalle para probar. **No sale de producción** | "Documento dentro del límite: aprobación estándar" |
| `info` | Un hecho normal que alguien querrá buscar | "Factura enviada al proveedor" |
| `warn` | Algo raro o rechazado, pero el sistema funcionó bien | "Pedido bloqueado por una regla de negocio" |
| `error` | Un fallo sin excepción, por ejemplo una respuesta de error | "El proveedor rechazó la factura" |
| `exception` | Lo que capturas en un `catch`: nivel `error`, con la clase y el stack | "No se pudo enviar el recordatorio" |

Un usuario que intenta guardar un pedido sin orden de compra no es un error del sistema: es `warn`. Reserva `error` para lo que alguien tiene que arreglar.

### 2. Mensaje fijo; lo que cambia, en metadata

MCLog agrupa los errores repetidos en una sola fila de **Errores**, y para eso compara los mensajes. Los números, las URLs y los correos los normaliza solo, pero no los nombres:

```js
// Mal: cada cliente abre un grupo distinto en Errores
mcLog.error(`El proveedor rechazó la factura de ${customerName}`);

// Bien: un solo grupo, y el cliente sigue a la vista al abrir el log
mcLog.error('El proveedor rechazó la factura', { customerId, httpStatus: response.code });
```

### 3. Lo que vayas a buscar, en el traceId

La búsqueda de MCLog mira el mensaje, la aplicación, el servicio, el host y el **traceId**, pero **no entra en la metadata**. Si soporte va a buscar un pedido por el número que le da el cliente, ese número tiene que ir en el traceId:

```js
mcLog.setDocument('weborder', externalId); // traceId "weborder:WEB-1001"
```

En un User Event no hace falta: la librería pone sola `<tipo>:<id>` del registro (`invoice:1234`). Como el traceId es el mismo en todos tus scripts, **Ver traza** muestra la historia completa del documento.

### 4. Registra lo excepcional y resume lo demás

Cada ejecución envía sus logs en una sola petición, pero cada `map` de un Map/Reduce es una ejecución aparte. Un log por fila en una importación de 10 000 filas son 10 000 peticiones, que chocan con el límite de MCLog. Cuenta los casos y registra un resumen al final, con una muestra de los que fallaron. Así lo hacen las recetas 5 y 6.

### 5. En un `catch`, usa `exception` y decide si relanzar

```js
try {
    sendReminder(invoice);
} catch (e) {
    mcLog.exception('No se pudo enviar el recordatorio', e, { tranId: invoice.tranId });
    // Sin "throw e": el proceso sigue con la siguiente factura.
}
```

- **Relanza** (`throw e`) si NetSuite debe enterarse: para impedir un guardado o para que un Map/Reduce cuente el fallo.
- **No relances** si el proceso debe continuar: la factura ya se guardó, o quedan más facturas en el bucle.

La librería no registra dos veces la misma excepción. Tampoco hace falta un `try/catch` en cada función: `wrapEntryPoints` registra lo que se escape.

> [!CAUTION]
> **Nunca registres** datos personales completos (direcciones, teléfonos, documentos de identidad), números de tarjeta o de cuenta, contraseñas ni tokens. Tampoco el cuerpo entero de una petición: casi siempre lleva datos del cliente. La librería oculta el valor de las claves de metadata que se llaman como una credencial (`password`, `token`, `apiKey`…), pero no mira dentro del texto del mensaje ni de otras claves.

## Receta 1 — Enviar una factura a un proveedor externo

**Ámbito:** integración de salida · **Tipo:** User Event (`afterSubmit`) sobre **Invoice** · **Descarga:** [`ue_invoice_send_to_provider.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ue_invoice_send_to_provider.js)

Cada vez que se crea o se edita una factura, la envía a la API de un proveedor (facturación electrónica, el ERP del cliente, un portal) y deja en MCLog el resultado de la llamada: si fue bien, cuánto tardó y, si no, qué respondió el proveedor.

### Parámetros

| ID del parámetro | Tipo | Qué poner |
|---|---|---|
| `custscript_mcl_prov_url` | Free-Form Text | La URL completa del endpoint del proveedor |
| `custscript_mcl_prov_secret` | Free-Form Text | El ID del API Secret con el token del proveedor, p. ej. `custsecret_proveedor_token` |

El token del proveedor no va en el código ni en un parámetro: va en un **API Secret** de NetSuite.

1. **Setup → Company → API Secrets → Create New** (o busca "API Secrets" en la búsqueda global).
2. Pon un **ID**, por ejemplo `_proveedor_token`, y pega el token como valor.
3. Limita el secreto a este script y al dominio del proveedor.
4. En el parámetro `custscript_mcl_prov_secret` del Deployment, pon el ID completo: `custsecret_proveedor_token`.

### La parte importante

```js
let response;
try {
    response = https.post({ url: config.url, body: JSON.stringify(payload), headers: buildHeaders(config) });
} catch (e) {
    // La factura ya está guardada: un fallo del proveedor no debe impedir trabajar.
    mcLog.exception('No se pudo conectar con el proveedor', e, { ...details, durationMs: Date.now() - startedAt });
    return;
}

const result = { ...details, httpStatus: response.code, durationMs: Date.now() - startedAt };
if (response.code >= 200 && response.code < 300) {
    mcLog.info('Factura enviada al proveedor', { ...result, providerId: providerIdFrom(response.body) });
} else {
    mcLog.error('El proveedor rechazó la factura', { ...result, providerResponse: String(response.body || '').slice(0, MAX_RESPONSE_IN_LOG) });
}
```

Adapta `buildPayload` a los campos que pide tu proveedor. El resto del script sirve tal cual.

### Qué verás en MCLog

| Situación | Nivel | Mensaje | Metadata útil |
|---|---|---|---|
| El proveedor aceptó la factura | `info` | Factura enviada al proveedor | `httpStatus`, `durationMs`, `providerId`, `total` |
| El proveedor la rechazó | `error` | El proveedor rechazó la factura | `httpStatus` y el inicio de su respuesta (`providerResponse`) |
| No hubo conexión | `error` | No se pudo conectar con el proveedor: … | La excepción de NetSuite, agrupada por su código |
| Faltan parámetros en el Deployment | `warn` | Envío al proveedor sin configurar | `missing`: qué parámetros faltan |

Todos llevan el traceId `invoice:<id>`: escríbelo en la búsqueda de MCLog para ver la historia de esa factura.

### Por qué está hecha así

- **`afterSubmit`, no `beforeSubmit`.** La factura ya está guardada cuando se llama al proveedor, así que una caída del proveedor no impide trabajar en NetSuite. El fallo queda en MCLog para reenviarla.
- **Sin el cuerpo enviado ni la URL completa en el log.** El cuerpo lleva datos del cliente, y la query string suele llevar tokens. Con el total, el número de líneas y el endpoint basta para investigar.
- **`durationMs` en cada llamada.** Si el proveedor se vuelve lento, lo ves en MCLog antes de que los usuarios se quejen de que guardar tarda.

> [!WARNING]
> Mientras el proveedor responde, el usuario espera a que termine el guardado. Si el proveedor suele tardar varios segundos, o si guardas muchas facturas a la vez (importaciones CSV), usa este script para marcar la factura como pendiente y envíalas desde un Scheduled o un Map/Reduce.

## Receta 2 — Recibir pedidos de un e-commerce

**Ámbito:** integración de entrada · **Tipo:** RESTlet (`post`) · **Descarga:** [`rl_order_intake.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/rl_order_intake.js)

Un sistema externo (tienda online, marketplace, app móvil) llama a este RESTlet con un pedido. El RESTlet lo valida, comprueba que no esté ya creado y crea la orden de venta.

```json
{
  "externalId": "WEB-1001",
  "customerId": 123,
  "lines": [
    { "itemId": 45, "quantity": 2, "rate": 10.5 },
    { "itemId": 46, "quantity": 1 }
  ]
}
```

| Respuesta | Cuándo |
|---|---|
| `{ "ok": true, "id": "5001" }` | Pedido creado |
| `{ "ok": true, "id": "5001", "duplicate": true }` | Ya existía un pedido con ese `externalId`: el sistema externo reintentó |
| `{ "ok": false, "errors": [{ "field": "lines[0].quantity", "message": "Debe ser mayor que cero" }] }` | Datos inválidos |
| `{ "ok": false, "errors": [{ "code": "INVALID_KEY_OR_REF", "message": "No se pudo crear el pedido" }] }` | NetSuite no pudo guardarlo |

No lleva parámetros. En el Deployment, **Status = Released** y, en **Audience**, el rol que usa la integración (la conexión TBA del sistema externo). El sistema externo debe enviar la cabecera `Content-Type: application/json`: sin ella, NetSuite entrega el cuerpo como texto y la receta lo rechaza.

### La parte importante

```js
// La búsqueda de MCLog entra en el traceId: lo que soporte vaya a buscar va aquí.
mcLog.setDocument('weborder', externalId);
mcLog.setContext({ channel: 'ecommerce' });

if (problems.length) {
    mcLog.warn('Pedido rechazado por datos inválidos', { problems });
    return { ok: false, errors: problems };
}
```

### Qué verás en MCLog

| Situación | Nivel | Mensaje |
|---|---|---|
| Datos inválidos | `warn` | Pedido rechazado por datos inválidos (con la lista de problemas) |
| Reintento de un pedido ya creado | `info` | Pedido duplicado: se devuelve el existente |
| Pedido creado | `info` | Pedido creado desde el e-commerce (con `salesOrderId`) |
| NetSuite no pudo guardarlo | `error` | No se pudo crear el pedido: … (agrupado por el código de NetSuite) |

Cuando el cliente llame diciendo "mi pedido WEB-1001 no aparece", escribe `weborder:WEB-1001` en la búsqueda de MCLog. Aparecen todos los intentos de ese pedido, también los rechazados, en orden.

### Por qué está hecha así

- **Valida todo antes de tocar un registro.** Lo que llega de fuera no es fiable. Un pedido inválido se rechaza con un mensaje que el otro sistema entiende, sin gastar governance en un guardado que va a fallar.
- **Busca duplicados por `externalId`.** Los sistemas externos reintentan cuando una respuesta tarda. Sin esta comprobación, un reintento crea un segundo pedido.
- **Ante un fallo de NetSuite solo devuelve el código.** El mensaje completo puede mostrar detalles internos de la cuenta. El detalle, con el stack, queda en MCLog.

## Receta 3 — Bloquear un pedido que no cumple una regla

**Ámbito:** validaciones · **Tipo:** User Event (`beforeSubmit`) sobre **Sales Order** · **Descarga:** [`ue_sales_order_rules.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ue_sales_order_rules.js)

Antes de guardar una orden de venta, comprueba una lista de reglas. Si una no se cumple, el guardado se bloquea con un mensaje para el usuario y MCLog anota qué regla saltó y con qué datos. Trae dos reglas de ejemplo:

- **`MC_PO_REQUIRED`**: a partir de cierto importe, el pedido necesita número de orden de compra.
- **`MC_LINE_QUANTITY_LIMIT`**: ninguna línea puede pasar de cierta cantidad.

### Parámetros

| ID del parámetro | Tipo | Qué poner | Si está vacío |
|---|---|---|---|
| `custscript_mcl_rules_po_from` | Decimal Number | Importe desde el que la OC es obligatoria | 10 000 |
| `custscript_mcl_rules_max_qty` | Integer Number | Cantidad máxima por línea | 500 |

### Añadir una regla

Las reglas están en la lista `RULES`, en la sección CONFIGURACIÓN. Para añadir una, copia un bloque y cambia sus tres partes:

```js
{
    code: 'MC_SHIP_DATE_REQUIRED',                       // código único: agrupa en MCLog
    message: () => 'Indica la fecha de envío.',          // lo que verá el usuario
    check: (order) => {                                  // null si se cumple; si no, los datos para el log
        const shipDate = order.getValue({ fieldId: 'shipdate' });
        return shipDate ? null : { shipDate: null };
    }
}
```

Las reglas se comprueban en orden y el script se para en la primera que no se cumple. Pon arriba las más importantes.

### La parte importante

```js
const blocked = error.create({ name: rule.code, message: rule.message(config), notifyOff: true });
mcLog.warn('Pedido bloqueado por una regla de negocio', { rule: rule.code, ...violation }, blocked);
throw blocked;
```

El error va como tercer argumento de `warn`. Así, MCLog guarda el código de la regla para agrupar sin subir el nivel a `error`, y la librería no lo registra otra vez como "Error no controlado" cuando se relanza.

### Qué verás en MCLog

| Situación | Nivel | Mensaje | Agrupado por |
|---|---|---|---|
| Una regla bloqueó el guardado | `warn` | Pedido bloqueado por una regla de negocio: … | El código de la regla |

En **Errores** tendrás una fila por regla, con las veces que salta. Si una regla bloquea cien pedidos al día, o la regla está mal o el equipo necesita formación: en los dos casos conviene saberlo.

### Por qué está hecha así

- **`warn`, no `error`.** El sistema funcionó: fue el usuario quien intentó algo no permitido.
- **Ignora las ediciones en línea (`xedit`).** Solo traen el campo cambiado, y las reglas darían falsos positivos. Si tu equipo edita en línea campos que afectan a las reglas, desactiva la edición en línea de esos campos.
- **Se aplica también a importaciones CSV y a integraciones.** Un User Event corre en cualquier contexto, no solo en el formulario. Es lo que suele quererse en una regla de negocio. Si no, filtra por `runtime.executionContext`.

## Receta 4 — Decidir la ruta de aprobación de un workflow

**Ámbito:** validaciones y reglas · **Tipo:** Workflow Action · **Descarga:** [`wa_approval_route.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/wa_approval_route.js)

Una acción de workflow que responde "¿necesita este documento aprobación de dirección?". El workflow usa la respuesta en una condición de transición.

### Parámetros y configuración

| Dónde | Qué poner |
|---|---|
| Script → **Return Type** | **Checkbox** |
| Parámetro `custscript_mcl_wa_limit` (Decimal Number) | Importe a partir del cual decide dirección. Si está vacío, 50 000 |
| Deployment → **Applies To** | El tipo de registro del workflow |

En el workflow:

1. Crea un campo de workflow de tipo **Checkbox**, por ejemplo `Necesita dirección`.
2. En el estado que decide, pulsa **New Action** y elige la acción con el nombre de tu script.
3. En **Store Result In**, elige el campo del paso 1.
4. En la transición hacia **Aprobación de dirección**, pon como condición que ese campo esté marcado.

### Qué verás en MCLog

| Situación | Nivel | Mensaje |
|---|---|---|
| El documento va a dirección | `info` | Documento enviado a aprobación de dirección |
| El documento sigue la ruta normal | `debug` | Documento dentro del límite: aprobación estándar |
| Falta el parámetro del límite | `warn` | Límite de aprobación sin configurar |

El caso normal es `debug` a propósito: en el sandbox lo ves mientras pruebas, y en producción no llena MCLog con miles de "todo bien". Lo excepcional, que un pedido suba a dirección, sí queda registrado, con el total, el límite y el workflow.

Un parámetro sin configurar no para el workflow: usa el valor por defecto y avisa. Es mejor enterarse por MCLog que por una auditoría.

## Receta 5 — Recordatorios de facturas vencidas

**Ámbito:** procesos masivos · **Tipo:** Scheduled · **Descarga:** [`ss_overdue_invoice_reminders.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/ss_overdue_invoice_reminders.js)

Busca las facturas abiertas con cierto retraso y envía un correo de recordatorio por cada una. Se programa, por ejemplo, cada mañana.

### Parámetros

| ID del parámetro | Tipo | Qué poner |
|---|---|---|
| `custscript_mcl_ss_author` | List/Record → Employee | El empleado que firma los correos (obligatorio) |
| `custscript_mcl_ss_min_days` | Integer Number | Días de retraso mínimos. Si está vacío, 1 |

En el Deployment, **Status = Scheduled** y, en la pestaña **Schedule**, la frecuencia (por ejemplo, diaria a las 7:00). Para probar, usa **Not Scheduled** y **Save and Execute**.

### La parte importante

```js
for (let index = 0; index < invoices.length; index++) {
    if (runtime.getCurrentScript().getRemainingUsage() < MIN_USAGE_TO_CONTINUE) {
        pending = invoices.length - index;
        mcLog.warn('Recordatorios detenidos por governance', { ...totals, pending });
        break;
    }
    // ...
    mcLog.withDocument('invoice', invoice.id, () => {
        try {
            sendReminder(invoice, config.author);
            totals.sent++;
        } catch (e) {
            totals.failed++;
            mcLog.exception('No se pudo enviar el recordatorio', e, { tranId: invoice.tranId });
        }
    });
}
```

`withDocument` asocia los logs de dentro a la factura (traceId `invoice:<id>`) y, al salir, vuelve a la traza de la ejecución, aunque haya habido un error.

### Qué verás en MCLog

| Situación | Nivel | Mensaje |
|---|---|---|
| Un correo no se pudo enviar | `error` | No se pudo enviar el recordatorio: … (con el traceId de la factura) |
| Se acabó la governance antes de terminar | `warn` | Recordatorios detenidos por governance (con cuántas quedan) |
| Terminó sin problemas | `info` | Recordatorios de facturas vencidas terminados |
| Terminó con fallos o pendientes | `warn` | Recordatorios de facturas vencidas terminados con incidencias |

El resumen trae los totales (encontradas, enviadas, sin correo, fallidas, pendientes) y una muestra de hasta 20 facturas sin correo de contacto.

### Por qué está hecha así

- **No registra cada correo enviado.** Serían cientos de logs iguales. El resumen dice cuántos salieron, y cada fallo va con su factura.
- **Se para antes de agotar la governance.** Un Scheduled que se queda sin unidades muere a mitad y no deja resumen. Este se detiene con margen, avisa de cuántas facturas quedaron pendientes y las recoge en la siguiente ejecución.
- **Procesa como mucho 500 por ejecución.** Para miles de facturas, pásalo a un Map/Reduce: NetSuite reparte el trabajo y la governance por ti.

## Receta 6 — Importar clientes desde un CSV

**Ámbito:** procesos masivos · **Tipo:** Map/Reduce · **Descarga:** [`mr_customer_import.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/mr_customer_import.js)

Lee un CSV del File Cabinet y crea un cliente por fila. Si un cliente ya existe (mismo `externalid`), lo salta: puedes relanzar la importación sin crear duplicados.

### El fichero

Con cabecera, las columnas en cualquier orden y separadas por coma o por punto y coma (el separador que usa Excel en español):

```text
externalid;companyname;email;phone
C-001;"Pérez; S.A.";ventas@perez.com;+34 600 000 000
C-002;Comercial Norte;;
```

`externalid` y `companyname` son obligatorias. Para añadir o quitar columnas, edita `COLUMNS` y la función `createCustomer`.

### Parámetros

| ID del parámetro | Tipo | Qué poner |
|---|---|---|
| `custscript_mcl_mr_file` | Integer Number | El id interno del CSV en el File Cabinet |
| `custscript_mcl_mr_subsidiary` | List/Record → Subsidiary | Solo en cuentas OneWorld |

En el Deployment, **Status = Not Scheduled**. Para lanzarla, rellena el fichero y pulsa **Save and Execute**.

### La parte importante

```js
const map = (context) => {
    const row = JSON.parse(context.value);
    mcLog.setContext({ csvLine: row.line, externalId: row.values.externalid });

    const problems = validateRow(row.values);
    if (problems.length) {
        // Sin log aquí: se anota y se resume al final.
        context.write({ key: 'rejected', value: JSON.stringify({ line: row.line, problems }) });
        return;
    }
    // ...
};
```

### Qué verás en MCLog

| Situación | Nivel | Mensaje |
|---|---|---|
| Fichero leído | `info` | Importación de clientes: fichero leído (con el número de filas) |
| Terminó sin rechazos | `info` | Importación de clientes terminada |
| Terminó con filas rechazadas | `warn` | Importación de clientes terminada con filas rechazadas (totales y hasta 20 filas con su motivo) |
| Un cliente falló al guardarse | `error` | Error no controlado en map: … (con la línea del CSV) |
| Falta el fichero o la cabecera | `error` | Error no controlado en getInputData: … |
| Al terminar, siempre | `info` o `warn` | Map/Reduce finalizado: el resumen de governance, segundos y errores que añade la librería |

### Por qué está hecha así

- **Las filas rechazadas no generan un log cada una.** Cada `map` es una ejecución con su propia petición a MCLog: 5 000 filas mal formadas serían 5 000 peticiones. Se anotan con `context.write` y salen en un solo resumen, con una muestra que dice qué línea corregir.
- **Los fallos inesperados sí se registran uno a uno.** Son raros y MCLog los agrupa por su código: diez `DUP_ENTITY` son una fila en **Errores**. Además, NetSuite los cuenta en el resumen del Map/Reduce.
- **Un fichero o una cabecera incorrectos paran la importación entera.** Mejor no importar nada que importar la mitad con las columnas cruzadas.

## Receta 7 — Errores de un formulario en el navegador

**Ámbito:** formularios · **Tipo:** Client Script + Suitelet · **Descarga:** [`cs_sales_order_form.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/cs_sales_order_form.js), [`sl_mclog_browser_proxy.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/examples/sl_mclog_browser_proxy.js) y [`lib_mclog_browser.js`](https://github.com/IngHeriEspinosa/MCLogs/raw/main/integrations/netsuite/lib_mclog_browser.js)

Un Client Script corre en el navegador del usuario. Si llamara a MCLog directamente, la API key quedaría a la vista de cualquiera con las herramientas de desarrollo del navegador. Por eso `lib_mclog.js` no funciona en Client Scripts, y esta receta usa un intermediario:

```text
Client Script ──► lib_mclog_browser.js ──► Suitelet proxy ──► lib_mclog.js ──► MCLog
                  (sin API key)            (con la sesión      (con la API key,
                                            del usuario)        en el servidor)
```

El ejemplo es un Client Script de la orden de venta: al elegir el cliente, comprueba si está retenido por crédito y avisa al usuario. Si la consulta falla (permisos del rol, un campo que ya no existe), el usuario sigue trabajando y el fallo queda en MCLog, en vez de perderse en la consola del navegador.

### Instalación, en este orden

**1. El proxy (una vez por cuenta).** Sube `sl_mclog_browser_proxy.js`, crea el Script con ID `_mcl_browser_proxy` y un Deployment con ID `_mcl_browser_proxy`:

| Campo del Deployment | Valor | Por qué |
|---|---|---|
| **Status** | Released | Lo llaman los formularios de todos los usuarios |
| **Available Without Login** | **Desmarcado** | Solo usuarios con sesión en NetSuite pueden enviar logs |
| **Audience** | Los roles que usan los formularios con Client Script | Los demás no pueden llamarlo |
| **Execute As Role** | Un rol con permiso **View** sobre `customrecord_mclog_config` | Así los usuarios no necesitan ver el registro que guarda la API key |

**2. La librería del navegador (una vez por cuenta).** Sube `lib_mclog_browser.js` a `/SuiteScripts/lib/`, junto a `lib_mclog.js`. Si en el paso 1 usaste otros IDs, cámbialos en su constante `PROXY`.

**3. Tus Client Scripts.** Sube `cs_sales_order_form.js`, crea el Script y un Deployment con **Applies To = Sales Order**. Tus propios Client Scripts se integran igual:

```js
define(['/SuiteScripts/lib/lib_mclog_browser'], (mcLogBrowser) => {

    const fieldChanged = (context) => {
        try {
            // ... tu lógica ...
        } catch (e) {
            mcLogBrowser.exception('No se pudo calcular el descuento', e, { fieldId: context.fieldId });
        }
    };

    return mcLogBrowser.wrapEntryPoints({ fieldChanged });
});
```

`lib_mclog_browser.js` tiene las mismas funciones que `lib_mclog.js`: `info`, `warn`, `error`, `exception` y `wrapEntryPoints`.

### Qué verás en MCLog

| Situación | Nivel | Mensaje |
|---|---|---|
| La consulta del cliente falló | `error` | No se pudo consultar la retención de crédito del cliente: … |
| Una excepción se escapó del Client Script | `error` | Error no controlado en `<punto de entrada>`: … |

Todos llevan en metadata `source: "browser"`, el ID del Client Script (`clientScript`) y la página. Si el registro ya tiene id, el traceId es `<tipo>:<id>`, el mismo que usan tus scripts de servidor: **Ver traza** muestra juntos lo que pasó en el navegador y en el servidor.

### Por qué está hecha así

- **El proxy trata lo que llega como no fiable.** Solo acepta `POST` con la cabecera `X-MCLog-Client`, que un formulario de otra web no puede añadir. Limita el tamaño y el número de logs, admite solo `info`, `warn` y `error`, y valida el tipo y el id del registro. El navegador tampoco puede hacerse pasar por un script de servidor: `source` y `clientScript` los pone el proxy.
- **Nunca molesta al usuario.** El envío va en segundo plano y, si falla, se ignora. Un error de MCLog no aparece nunca en pantalla.
- **No inunda.** El mismo error se envía una sola vez por página, y como mucho 10 envíos por carga de página. Un error dentro de un bucle no genera cien peticiones.
- **Cada envío es una petición**, a diferencia de los scripts de servidor, que agrupan. Registra en el navegador solo errores y avisos, no cada cambio de campo.

## Antes de pasar a producción

| Comprobación | Por qué |
|---|---|
| Probado en un sandbox, con su propia API key | Un refresh del sandbox copia la clave de producción: cámbiala después de cada refresh |
| Deployment en **Released**, con los roles correctos en **Audience** | En **Testing**, el script solo corre para su dueño |
| Esos roles pueden ver `customrecord_mclog_config` (o el Deployment tiene **Execute As Role**) | Si no, la librería se desactiva en silencio en esas ejecuciones |
| Ningún dato personal, tarjeta ni token en mensajes o metadata | Los logs los leen más personas que los registros de NetSuite |
| En Map/Reduce, ningún log por cada clave en el caso normal | 10 000 claves serían 10 000 peticiones |
| Una [alerta](configurar-alertas.md) para los errores nuevos de la aplicación | Para enterarte antes que el cliente |

## Si algo falla

La librería **nunca rompe tus scripts**: cuando algo va mal, lo anota en el **Execution Log** del script y sigue. La tabla completa de mensajes está en [Integrar NetSuite con lib_mclog.js → Si algo falla](integrar-netsuite-lib-mclog.md#si-algo-falla). Estos son los casos propios de las recetas:

| Síntoma | Causa y solución |
|---|---|
| Nada en MCLog ni en el Execution Log | El script no se ejecutó: revisa **Status**, **Audience** y **Applies To** del Deployment. En **Testing**, solo corre para su dueño |
| `MCLog: respuesta no exitosa` con `HTTP 404` | La URL del registro de configuración no es la de la API. Lo más común: termina en `/mcp`. Quítalo |
| `MCLog: no se pudo leer la configuración` | El rol que ejecuta no puede ver `customrecord_mclog_config`. Añádelo a la lista de permisos del registro o, en el proxy de la receta 7, usa **Execute As Role** |
| Receta 1: "Envío al proveedor sin configurar" | Faltan los parámetros en la pestaña **Parameters** del **Deployment** (no del Script) |
| Receta 1: el proveedor responde `401` | El API Secret no existe, su ID no coincide con el parámetro o no permite este script |
| Receta 2: "El cuerpo debe ser un objeto JSON" | El sistema externo no envía `Content-Type: application/json` |
| Receta 6: `MC_IMPORT_NOT_CONFIGURED` o `MC_IMPORT_BAD_HEADER` | Falta el id del fichero en el Deployment, o la cabecera del CSV no tiene `externalid` y `companyname` |
| Receta 7: nada en MCLog y el formulario funciona | Los IDs de `PROXY` en `lib_mclog_browser.js` no coinciden con el Script y el Deployment del proxy, el proxy no está en **Released** o su **Audience** no incluye el rol del usuario |

## Probar los ejemplos sin una cuenta

`test_examples.js` prueba las siete recetas y `lib_mclog_browser.js` fuera de NetSuite, con la `lib_mclog.js` real sobre un NetSuite simulado. Comprueba la lógica de cada receta y lo que llegaría a MCLog: nivel, mensaje, traceId y metadata. No necesita dependencias ni una cuenta:

```bash
node integrations/netsuite/test_examples.js
```

Si adaptas un ejemplo, pásalas para comprobar que no rompiste nada. En este repositorio corren en CI con cada cambio. No cubren lo que depende de tu cuenta (campos, permisos, governance real): eso se prueba en un sandbox.

## Siguiente paso

- [Configurar alertas](configurar-alertas.md) para enterarte de un error nuevo sin mirar el dashboard.
- [Investigar un incidente](investigar-incidente.md): de un error agrupado a la traza completa del documento.
