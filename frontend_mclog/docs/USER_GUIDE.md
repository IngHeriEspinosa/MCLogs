# MCLog · Manual de Usuario del Dashboard

> Manual centrado en el dashboard. El manual completo del proyecto, que además cubre cómo enviar logs desde tus aplicaciones y cómo administrar el servicio, está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Términos en el [glosario](../../docs/GLOSSARY.md); dudas concretas en el [FAQ](../../docs/FAQ.md).

## Acceso

1. Abre el dashboard (en desarrollo: http://localhost:3001). La primera pantalla es el acceso; si ya tienes una sesión abierta, entras directo a Logs.
2. Escribe tu **Correo** y **Contraseña** y pulsa **Entrar**. El administrador crea las cuentas; la inicial es el `ADMIN_EMAIL` configurado en el backend (la cuenta root).
3. Si tu cuenta tiene la **verificación en dos pasos** activa, aparece una segunda pantalla:
   - Escribe el **Código de verificación** de 6 dígitos que muestra tu app autenticadora y pulsa **Verificar**.
   - Si no tienes el móvil a mano, escribe uno de tus **códigos de recuperación** en el mismo campo. Da igual si lo escribes con o sin guion.
   - Tienes 5 minutos. Si pasan, verás "El intento de inicio de sesión ha caducado": pulsa **Volver** y escribe de nuevo la contraseña.
4. Entras en Logs o, si ibas a otra página cuando la sesión caducó, vuelves a ella.
5. La sesión se renueva sola mientras uses la aplicación. Si expira del todo, volverás al login automáticamente.

> Tras 10 intentos fallidos en 15 minutos verás "Demasiados intentos": espera un rato antes de volver a probar.

A la izquierda está el menú:

- **Observabilidad**: **Logs**, **Registros**, **Errores**, **Reportes** y **Snapshots**.
- **Selector de espacio** (arriba): el espacio de trabajo activo y tu rol en él; desde aquí cambias de espacio, creas uno o sales del actual.
- **Espacio** (solo si eres dueño del espacio activo): **Miembros**, **Alertas**, **API keys** y **Lab**.
- **Plataforma** (solo admin de plataforma): **Cuentas**.
- Abajo, **Mi cuenta** y el botón para contraer el menú a solo iconos.

En el móvil, el menú se abre con el botón ☰ de arriba a la izquierda.

## Ayuda en cada campo

Junto al nombre de casi todos los campos (en el login, los filtros de Registros, las propiedades del detalle de un log, Reportes, Alertas, API keys, Usuarios, el Lab y Mi cuenta) hay un icono de información. Pasa el ratón por encima, o púlsalo en el móvil, y verás una explicación de qué significa ese campo y cómo se usa. <kbd>Esc</kbd> lo cierra.

Lo mismo con las cifras: el icono de cada tarjeta de métrica (en Logs, Errores y Traza) y el ⓘ junto al título de cada gráfico explican qué mide y cómo se calcula.

## Idioma y tema

Arriba a la derecha, en todas las pantallas (también en el login):

- **ES / EN** cambia el idioma de toda la interfaz al momento.
- **Sol / luna / monitor** elige tema claro, oscuro o el del sistema (sigue el modo de tu ordenador y cambia con él).

Las dos preferencias se recuerdan en ese navegador. También están en **Mi cuenta**.

## Errores: por dónde empezar

Es la pantalla que responde **qué está roto**, y casi siempre el mejor punto de partida.

Cada fila es un fallo distinto, **no una ocurrencia**. Si el mismo timeout ha pasado veintinueve veces, verás una fila con un 29 al lado en lugar de veintinueve líneas iguales: MCLog las agrupa aunque los mensajes lleven dentro números de pedido o identificadores distintos.

Arriba eliges el rango, **Errores** o **Warnings**, el entorno y la aplicación. Debajo, cuatro cifras: cuántos fallos distintos hay, cuántas ocurrencias suman, la aplicación más afectada y cuánto pesa el fallo principal sobre el total.

| Columna | Qué significa |
|---|---|
| **Veces** | Ocurrencias dentro del rango, con su peso sobre el total |
| **Fallo** | Clase de la excepción, código, mensaje de ejemplo y huella |
| **Aplicación** | Dónde ocurre, y en qué servicio |
| **Actividad** | Cuándo fue la última vez, y la primera dentro del rango |

**Primera aparición reciente suele significar error nuevo**, que casi siempre apunta a lo último que se tocó. Ojo: es la primera vez *dentro del rango elegido*; amplíalo a 30 días para confirmarlo.

**Ver ocurrencias** te lleva a los registros concretos de ese fallo. El botón ✦ copia un **brief para IA** del fallo, con su ejemplo más reciente y el stack, listo para pegar en un agente.

## Logs

### Filtros

Una sola fila encima de todo, y todo lo de debajo responde a ella:

- **Rango de tiempo**: rangos rápidos (15 minutos… 30 días, o todo el histórico) o un rango a medida en el calendario, con hora de inicio y de fin.
- **Buscar**: busca a la vez en el mensaje, la aplicación, el servicio, el host y el traceId. Pulsa <kbd>/</kbd> para ir directo al buscador.
- **Nivel**, **Entorno** y **Aplicación**. El de aplicación tiene buscador y admite escribir un nombre que no esté en la lista.
- **Limpiar filtros** quita todo salvo el rango.

> La URL refleja los filtros activos: copia el enlace del navegador para compartir exactamente lo que estás viendo con alguien de tu espacio. Para alguien sin cuenta, o para una foto fija que no cambie, usa **Compartir** ([Snapshots](#compartir-un-snapshot)).

### Resumen

- **Tarjetas**: registros, errores y warnings del rango (con su tendencia), fallos distintos y aplicaciones activas. El icono de cada una explica qué mide.
- **Actividad**: volumen por intervalo, apilado por nivel. Responde a **¿desde cuándo pasa esto?**: si la franja roja aparece de golpe, ahí empezó el incidente. Pasa el ratón para ver el desglose, **arrastra sobre el gráfico para acotar el rango** a esa franja, o haz clic en una barra para aislarla. **Ver como tabla** muestra las mismas cifras en filas.
- **Por nivel** y **por entorno**, **fallos principales** y **aplicaciones más activas**. Un clic en cualquiera de ellos lo convierte en filtro.

El resumen respeta el rango, la aplicación y el entorno, pero no la búsqueda ni el nivel. El botón con el icono de panel, arriba, lo oculta para dejarle todo el sitio a la tabla.

### En vivo

El botón **En vivo** deja la conexión abierta y va colocando arriba, resaltados, los logs según llegan. Es lo que quieres mientras reproduces un fallo o justo después de desplegar. El punto verde palpitando indica conexión viva; ámbar, conectando; rojo, reconectando.

Solo se activa en la primera página, con el orden por fecha descendente y un rango que llegue hasta ahora. En cualquier otra vista se desactiva solo, porque colar filas nuevas en medio falsearía lo que estás mirando.

### La tabla

Cada fila lleva a la izquierda una barra del color de su nivel (rojo error, ámbar warn, azul info, gris debug), la hora con milisegundos, la aplicación y el servicio, el entorno y el mensaje. En pantallas anchas aparecen también el host y la traza.

En la cabecera de la tabla eliges el **orden**, la **densidad** (cómoda o compacta) y el **tamaño de página**.

**Haz clic en una fila** (o muévete con las flechas y pulsa Intro) para abrir su detalle, en una ventana casi a pantalla completa: a la izquierda el mensaje, las acciones, el stack y la metadata; a la derecha las propiedades y el contexto. <kbd>←</kbd> <kbd>→</kbd> (o los botones de arriba) pasan al registro anterior o siguiente sin cerrarla; <kbd>Esc</kbd> o un clic fuera la cierran.

| En el detalle | Qué hace |
|---|---|
| **Ver traza** | Abre la operación entera, de todos los sistemas por los que pasó |
| **Fallos iguales** | Filtra a las demás ocurrencias de este mismo fallo |
| **Copiar JSON** | Copia el registro entero al portapapeles |
| **Copiar para IA** | Copia un brief en Markdown con el log, su stack y su contexto, con los datos sensibles enmascarados |

Debajo tienes las propiedades (con botón de copiar en trace ID, huella e ID), el **stack trace** con las líneas de tu propio código resaltadas, la **metadata** y el **contexto**: lo que pasó en la misma aplicación dos minutos antes y después.

### Exportar

El botón **Exportar** ofrece:

- **CSV** y **NDJSON**: los logs con los filtros activos, hasta 10 000 registros. CSV abre en Excel pero no lleva metadata; NDJSON trae el registro completo, un JSON por línea.
- **Informe Markdown** y **Brief para agentes IA**: abren la pantalla de Reportes con el mismo rango y ámbito, y lo generan al momento.

Junto al número de registros de la tabla hay un icono que abre la misma vista en **Registros**, con los filtros que tengas puestos.

## Compartir un snapshot

**Compartir**, arriba a la derecha en Logs, Registros, Errores y Traza, guarda una **copia congelada** de lo que ves y te da un enlace: en Logs y Registros, el resumen y hasta 500 logs de la tabla; en Errores, los fallos agrupados con un ejemplo de cada uno (**Ver ejemplo**); en una Traza, la operación completa.

1. Revisa el **Título**: se propone uno con el rango y la aplicación.
2. Elige **Quién puede verlo**:
   - **Equipo**: solo los miembros de este espacio, con su sesión.
   - **Público**: cualquiera con el enlace, sin cuenta. Solo lo puede crear el dueño del espacio (si no puedes, la opción aparece con un candado y el motivo debajo). Correos, IPs, tokens y contraseñas se enmascaran siempre, y no se muestra el nombre del espacio.
3. Elige cuándo **Caduca**: 1, 7 o 30 días, o nunca.
4. Pulsa **Crear enlace**, y después **Copiar enlace** o **Abrir**.

Quien lo abre ve el título, cuándo se capturó, los filtros, el resumen y la tabla, que puede ordenar y paginar; el detalle de cada log se abre como aquí, pero sin traza, contexto ni "fallos iguales", que llevarían a datos en vivo.

Al pegar el enlace de uno público en Slack, WhatsApp o Teams sale una tarjeta con el título y las cifras; uno de equipo sale como tarjeta genérica, sin título.

En **Observabilidad → Snapshots** están todos los del espacio, con su autor, caducidad y número de visitas. **Borrar** lo quita al momento, para todos: puede hacerlo quien lo creó o el dueño del espacio. Guía completa: [Compartir un snapshot](../../docs/guias/compartir-snapshots.md).

## Registros: la tabla completa y la búsqueda avanzada

**Registros** es la tabla de logs sin nada más alrededor: sin resumen ni modo en vivo, pensada para buscar un registro concreto y leerlo.

Arriba tienes la misma barra de filtros que en Logs (rango, buscar, nivel, entorno, aplicación y **Limpiar filtros**). Debajo, la tarjeta **Búsqueda avanzada**, con seis campos que buscan **cada uno en su propio campo del log**:

| Campo | Busca en | Ejemplo |
|---|---|---|
| **Mensaje contiene** | El mensaje | `timeout` |
| **Servicio** | El servicio | `checkout` |
| **Host** | La máquina | `web-01` |
| **Trace ID exacto** | El traceId, **completo** | el id entero |
| **Nombre del error** | La clase de la excepción | `TypeError` |
| **Código de error** | El código | `ECONNRESET` |

Reglas:

- Los campos se combinan entre sí (**Y**): `Servicio = checkout` y `Código de error = ECONNRESET` devuelve solo los ECONNRESET de checkout.
- Todos admiten texto parcial y no distinguen mayúsculas, **salvo el Trace ID**, que tiene que ser exacto.
- Se combinan también con los filtros de arriba. Si no ves nada, revisa primero el **rango de tiempo**.
- **Limpiar filtros** no borra la búsqueda avanzada; para eso está **Limpiar búsqueda avanzada**.
- El número junto al título indica cuántos campos tienes activos. La tarjeta se puede plegar y recuerda cómo la dejaste.
- La búsqueda viaja en la URL: copia el enlace para compartirla.

**Haz clic en un registro** para abrirlo a pantalla completa:

- A la izquierda, el mensaje, los botones de acción, el stack y la metadata; a la derecha, las propiedades y el contexto.
- **Registro anterior** / **Registro siguiente**, o las flechas <kbd>←</kbd> <kbd>→</kbd>, recorren la página sin cerrar. Arriba ves en cuál estás ("3 de 20 en esta página").
- <kbd>Esc</kbd> o un clic fuera lo cierra.

## Reportes

Genera documentos a partir de los logs de un rango, en tres formatos:

| Tipo | Para quién | Qué lleva |
|---|---|---|
| **Informe Markdown** | Personas | Hallazgos clave en prosa, comparación con el periodo anterior, métricas, actividad, niveles, aplicaciones, fallos con su stack y enlace a sus ocurrencias, y errores recientes |
| **Brief para agentes IA** | Un agente de IA (Claude, ChatGPT…) | Instrucciones (rol, objetivo, pasos, reglas, formato de respuesta), las herramientas MCP de MCLog para seguir investigando y los datos en bloques estructurados |
| **Datos para agentes (JSON)** | Pipelines y herramientas | Lo mismo que el brief, en un único objeto JSON con esquema estable |

A la izquierda eliges el rango, la aplicación y el entorno, las secciones, cuántos fallos incluir y si llevan stack (del ejemplo más reciente de los 20 primeros fallos, como mucho). Para los formatos de IA, además, el **objetivo** (triaje, regresión tras un despliegue, resumen de incidente) y unas **instrucciones adicionales** opcionales, por ejemplo "desplegamos la 2.3 a las 14:00". El idioma del reporte se elige aparte del de la interfaz. **Generar** está siempre visible al pie del panel, y **Ctrl + Enter** genera desde cualquier punto de la página.

Tus preferencias (tipo, secciones, opciones, idioma) se recuerdan en este navegador; **Restablecer** vuelve a los valores por defecto. El rango, la aplicación y el entorno van en la URL: recargar no los pierde y puedes compartir el enlace.

Secciones destacadas:

- **Comparación con el periodo anterior**: compara con la ventana de igual duración justo antes (con "Últimas 24 horas", las 24 horas previas). Muestra cómo cambiaron registros, errores y tasa de error, y qué fallos son **nuevos**, cuáles **empeoraron** (más de un 25 % y al menos 3 ocurrencias más) y cuáles **dejaron de aparecer**. "Nuevo" significa que no apareció en el periodo anterior, no que nunca haya pasado. Es lo que hace útil el objetivo "Regresión tras un despliegue".
- **Aplicaciones**: los registros se cuentan desde el inicio de la ventana hasta ahora; los errores son los de la ventana.
- **Warnings agrupados** (desactivada por defecto): los warnings más repetidos, para separar el ruido de lo importante.

En el informe Markdown, cada fallo lleva un enlace **ver ocurrencias** que abre los registros de ese fallo en MCLog, con la misma ventana.

**Enmascarar datos sensibles** oculta correos, IPs, tokens, JWT y claves largas antes de exportar. Viene activado en los formatos de IA: déjalo así siempre que el reporte vaya a un modelo externo o salga de tu organización. Las huellas, los traceId y los UUID que aparecen en los mensajes (normalmente ids de pedidos, usuarios…) se conservan, porque hacen falta para seguir investigando.

A la derecha, la vista previa: **Vista** muestra el documento formateado y **Fuente** el Markdown tal cual. Arriba ves el tamaño, una estimación de tokens y cuántos valores se enmascararon; si un brief para IA pasa de ~100 000 tokens, un aviso te sugiere recortarlo porque puede no caber en el contexto del modelo. Los botones **Copiar** y **Descargar** son los únicos momentos en que algo sale de tu navegador.

> Todo lo que el brief incluye de los logs va dentro de `<mclog_data>`, y las reglas le dicen al agente que ese contenido son datos, no instrucciones. Así, un log que diga "ignora lo anterior" no le cambia la tarea.

## Traza: seguir una operación

Se llega con **Ver traza** desde cualquier log que tenga traceId.

Muestra todos los registros de una misma operación en orden cronológico, **aunque haya pasado por varias aplicaciones**. Cada línea lleva el tiempo desde el primer registro y el salto desde el anterior (Δ), y a la derecha una pista con la duración total: el tramo coloreado es el tiempo entre un paso y el siguiente. Si un tramo ocupa media pista, ahí está el cuello de botella. Pulsa cualquier línea para ver su detalle, stack y metadata.

Arriba: **Descargar .md** guarda la traza como documento, y **Copiar para IA** copia un brief para que un agente la analice.

## Secciones de administración

**Alertas**, **API keys** y **Lab** solo los ve el dueño del espacio activo; **Usuarios** (Cuentas), los admins de plataforma. El procedimiento completo está en [docs/USER_GUIDE.md § Parte C](../../docs/USER_GUIDE.md#parte-c--administrar-el-servicio).

| Sección | Para qué |
|---|---|
| **Alertas** | Canales (webhook, correo, Telegram) con envío de prueba y edición (los secretos guardados se conservan si dejas el campo vacío), reglas (umbral de repeticiones o error nuevo) e historial de avisos. Los interruptores activan y desactivan sin borrar |
| **API keys** | Crear claves para que las máquinas envíen o consulten, con permisos, alcance por aplicación y caducidad. El secreto se muestra **una sola vez**, en una ventana que no se cierra hasta que confirmas que lo guardaste |
| **Usuarios** | Alta, cambio de rol, reseteo de contraseña y baja. Las etiquetas **Root** y **2FA** marcan la cuenta root (no se puede degradar ni eliminar) y quién tiene la verificación en dos pasos activa |
| **Lab** | Escenarios de prueba que envían logs de verdad para ver cada pantalla en acción, y un compositor para enviar un log a medida |

### Lab

El Lab sirve para probar MCLog sin esperar a que tus aplicaciones fallen: cada escenario envía logs reales a las aplicaciones `lab-*`.

1. Elige el **Entorno de destino**. Por defecto es **Desarrollo** (`development`), así no se mezcla con las métricas ni con las alertas de producción. Si eliges producción, verás un aviso: esos logs cuentan en las métricas y pueden disparar alertas reales.
2. En la tarjeta del escenario, lee **Qué verás** y pulsa **Ejecutar**. Una barra muestra el progreso ("40 de 120"); **Detener** lo corta cuando quieras. Puedes lanzar varios a la vez.
3. Al terminar aparecen enlaces directos al resultado: **Ver en Logs**, **Ver en Errores**, **Abrir la traza**, **Brief para IA** o **Revisar alertas**.

| Escenario | Qué envía | Qué mirar |
|---|---|---|
| **Tráfico normal** | 120 registros de tres servicios en la última hora | Gráfico de actividad, tarjetas y tabla |
| **Error agrupado** | El mismo timeout 25 veces con datos distintos | Una sola fila en Errores con 25 ocurrencias |
| **Traza distribuida** | Una compra por gateway, auth, inventory y billing, que falla en billing | La traza completa, con el salto de 2 s antes del fallo |
| **Pico de incidente** | 80 errores y warnings en 5 minutos | Pico rojo en Actividad; dispara las reglas de umbral |
| **Error nuevo** | Un fallo con huella nueva en cada ejecución | Grupo nuevo en Errores; dispara las reglas de Error nuevo |
| **Datos sensibles** | Correos, IPs, tokens y contraseñas ficticios | Que el brief para IA y "Copiar para IA" los enmascaran |
| **Stream en vivo** | 20 logs, uno cada 0,75 s | Abre Logs en otra pestaña con **En vivo** activado |

**Log a medida** compone un log campo por campo (aplicación, que siempre empieza por `lab-`, servicio, nivel, entorno, mensaje, traceId y, en **Error y metadata**, clase y código de error, stack y metadata en JSON) y lo envía con **Enviar log**. A la derecha, **Petición** muestra la misma llamada en JSON y en cURL, lista para copiarla en tu integración: solo cambia `<TU_API_KEY>` por una clave con permiso ingest.

**Borrar datos del lab** elimina todos los logs de las aplicaciones `lab-*` (pide un segundo clic, **Sí, borrar**). No toca ninguna otra aplicación.

## Mi cuenta

- **Sesión**: tu correo, tu rol y, si es el caso, la etiqueta **Root**.
- **Preferencias**: tema e idioma, guardados en este navegador.
- **Cambiar contraseña**: contraseña actual y la nueva dos veces (mínimo 8 caracteres y distinta de la actual). Cambiarla **cierra la sesión en todos los dispositivos**, incluido el actual, así que tendrás que volver a entrar.

### Verificación en dos pasos

Añade un código de tu móvil a la contraseña. Sirve cualquier app TOTP: Google Authenticator, Microsoft Authenticator, 1Password…

**Activarla:**

1. Pulsa **Activar verificación en dos pasos**.
2. Escanea el código QR con tu app. Si no puedes, copia la clave que aparece debajo y añádela a mano en la app.
3. Escribe el código de 6 dígitos que muestra la app y pulsa **Verificar y activar**.
4. Aparecen tus **8 códigos de recuperación**. Cópialos (**Copiar**) y guárdalos en un lugar seguro, como un gestor de contraseñas: **no se vuelven a mostrar**. Pulsa **Ya los he guardado**.

La tarjeta pasa a **Activada**. Desde ahora, cada inicio de sesión te pedirá el código.

**Desactivarla:** **Desactivar**, escribe tu **Contraseña actual** y un **Código de la app o de recuperación**, y confirma.

**Cambiar de móvil:** desactívala desde el móvil viejo (o con un código de recuperación) y vuelve a activarla con el nuevo.

> Cada código de recuperación sirve **una sola vez**. Si has gastado varios, desactiva y vuelve a activar la verificación para obtener 8 nuevos.

### Zona de peligro

**Eliminar mi cuenta** borra tu usuario y cierra todas tus sesiones. Las API keys que creaste siguen funcionando.

1. Pulsa **Eliminar mi cuenta**.
2. Escribe tu contraseña en **Confirma con tu contraseña** y, si tienes la verificación en dos pasos, un código.
3. Escribe **ELIMINAR** para confirmar y pulsa **Eliminar definitivamente**.

No se puede deshacer. La cuenta root no se puede eliminar, y tampoco la del último administrador.

## Consejos

- **Empieza por Errores**, no por Logs, salvo que ya sepas qué buscas.
- **Primera aparición reciente = sospechoso principal.** Es la señal más barata que tienes para triar.
- **Arrastra sobre el gráfico de actividad** para ir directo a la franja del incidente.
- **El rango de tiempo es el filtro que más se queda puesto sin querer.** Si ves "No hay registros que coincidan" y esperabas resultados, amplíalo primero.
- **La metadata y el stack son donde está lo bueno.** El mensaje dice qué falló; el stack dice dónde y la metadata con qué datos.
- **Para pedir ayuda a una IA, usa el brief**, no un copiar y pegar de la pantalla: lleva el contexto, las reglas y los datos enmascarados.
- **Comparte la URL, no capturas.** Quien la reciba puede seguir filtrando desde ahí.
