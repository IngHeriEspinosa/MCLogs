# MCLog · Manual de Usuario del Dashboard

> Manual centrado en el dashboard. El manual completo del proyecto, que además cubre cómo enviar logs desde tus aplicaciones y cómo administrar el servicio, está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Términos en el [glosario](../../docs/GLOSSARY.md); dudas concretas en el [FAQ](../../docs/FAQ.md).

## Acceso

1. Abre el dashboard (en desarrollo: http://localhost:3001).
2. Inicia sesión con tu correo y contraseña. El administrador las crea; el usuario inicial es el `ADMIN_EMAIL` configurado en el backend.
3. La sesión se renueva sola mientras uses la aplicación. Si expira del todo, volverás al login automáticamente.

A la izquierda está el menú: **Logs**, **Errores** y **Reportes**, y, si tu rol es `admin`, **Alertas**, **API keys** y **Usuarios**. Abajo, **Mi cuenta** y el botón para contraer el menú a solo iconos. En el móvil, el menú se abre con el botón ☰ de arriba a la izquierda.

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

> La URL refleja los filtros activos: copia el enlace del navegador para compartir exactamente lo que estás viendo.

### Resumen

- **Tarjetas**: registros, errores y warnings del rango (con su tendencia), fallos distintos y aplicaciones activas.
- **Actividad**: volumen por intervalo, apilado por nivel. Responde a **¿desde cuándo pasa esto?**: si la franja roja aparece de golpe, ahí empezó el incidente. Pasa el ratón para ver el desglose, **arrastra sobre el gráfico para acotar el rango** a esa franja, o haz clic en una barra para aislarla. **Ver como tabla** muestra las mismas cifras en filas.
- **Por nivel** y **por entorno**, **fallos principales** y **aplicaciones más activas**. Un clic en cualquiera de ellos lo convierte en filtro.

El resumen respeta el rango, la aplicación y el entorno, pero no la búsqueda ni el nivel. El botón con el icono de panel, arriba, lo oculta para dejarle todo el sitio a la tabla.

### En vivo

El botón **En vivo** deja la conexión abierta y va colocando arriba, resaltados, los logs según llegan. Es lo que quieres mientras reproduces un fallo o justo después de desplegar. El punto verde palpitando indica conexión viva; ámbar, conectando; rojo, reconectando.

Solo se activa en la primera página, con el orden por fecha descendente y un rango que llegue hasta ahora. En cualquier otra vista se desactiva solo, porque colar filas nuevas en medio falsearía lo que estás mirando.

### La tabla

Cada fila lleva a la izquierda una barra del color de su nivel (rojo error, ámbar warn, azul info, gris debug), la hora con milisegundos, la aplicación y el servicio, el entorno y el mensaje. En pantallas anchas aparecen también el host y la traza.

En la cabecera de la tabla eliges el **orden**, la **densidad** (cómoda o compacta) y el **tamaño de página**.

**Haz clic en una fila** (o muévete con las flechas y pulsa Intro) para abrir su detalle. En pantallas de 1920 px o más se abre como una columna junto a la tabla, y puedes seguir bajando con las flechas viendo cada detalle; en pantallas más pequeñas se abre por encima y se cierra con <kbd>Esc</kbd>.

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

## Reportes

Genera documentos a partir de los logs de un rango, en tres formatos:

| Tipo | Para quién | Qué lleva |
|---|---|---|
| **Informe Markdown** | Personas | Hallazgos clave en prosa, métricas, actividad, niveles, aplicaciones, fallos con su stack y errores recientes |
| **Brief para agentes IA** | Un agente de IA (Claude, ChatGPT…) | Instrucciones (rol, objetivo, pasos, reglas, formato de respuesta), las herramientas MCP de MCLog para seguir investigando y los datos en bloques estructurados |
| **Datos para agentes (JSON)** | Pipelines y herramientas | Lo mismo que el brief, en un único objeto JSON con esquema estable |

A la izquierda eliges el rango, la aplicación y el entorno, las secciones, cuántos fallos incluir y si llevan stack. Para los formatos de IA, además, el **objetivo** (triaje, regresión tras un despliegue, resumen de incidente) y unas **instrucciones adicionales** opcionales, por ejemplo "desplegamos la 2.3 a las 14:00". El idioma del reporte se elige aparte del de la interfaz.

**Enmascarar datos sensibles** oculta correos, IPs, tokens, JWT y claves largas antes de exportar. Viene activado en los formatos de IA: déjalo así siempre que el reporte vaya a un modelo externo o salga de tu organización. Las huellas y los traceId se conservan, porque el agente los necesita para seguir investigando.

A la derecha, la vista previa: **Vista** muestra el documento formateado y **Fuente** el Markdown tal cual. Arriba ves el tamaño y una estimación de tokens (útil para saber si cabe en el contexto del modelo), y los botones **Copiar** y **Descargar**. Nada sale de tu navegador hasta que lo descargas o lo copias.

> Todo lo que el brief incluye de los logs va dentro de `<mclog_data>`, y las reglas le dicen al agente que ese contenido son datos, no instrucciones. Así, un log que diga "ignora lo anterior" no le cambia la tarea.

## Traza: seguir una operación

Se llega con **Ver traza** desde cualquier log que tenga traceId.

Muestra todos los registros de una misma operación en orden cronológico, **aunque haya pasado por varias aplicaciones**. Cada línea lleva el tiempo desde el primer registro y el salto desde el anterior (Δ), y a la derecha una pista con la duración total: el tramo coloreado es el tiempo entre un paso y el siguiente. Si un tramo ocupa media pista, ahí está el cuello de botella. Pulsa cualquier línea para ver su detalle, stack y metadata.

Arriba: **Descargar .md** guarda la traza como documento, y **Copiar para IA** copia un brief para que un agente la analice.

## Secciones de administración

Solo visibles con rol `admin`. El procedimiento completo está en [docs/USER_GUIDE.md § Parte C](../../docs/USER_GUIDE.md#parte-c--administrar-el-servicio).

| Sección | Para qué |
|---|---|
| **Alertas** | Canales (webhook, correo, Telegram) con envío de prueba, reglas (umbral de repeticiones o error nuevo) e historial de avisos. Los interruptores activan y desactivan sin borrar |
| **API keys** | Crear claves para que las máquinas envíen o consulten, con permisos, alcance por aplicación y caducidad. El secreto se muestra **una sola vez**, en una ventana que no se cierra hasta que confirmas que lo guardaste |
| **Usuarios** | Alta, cambio de rol, reseteo de contraseña y baja |

## Mi cuenta

Tus datos de sesión, las preferencias de tema e idioma y el cambio de contraseña. Cambiarla **cierra la sesión en todos los dispositivos**, incluido el actual, así que tendrás que volver a entrar.

## Consejos

- **Empieza por Errores**, no por Logs, salvo que ya sepas qué buscas.
- **Primera aparición reciente = sospechoso principal.** Es la señal más barata que tienes para triar.
- **Arrastra sobre el gráfico de actividad** para ir directo a la franja del incidente.
- **El rango de tiempo es el filtro que más se queda puesto sin querer.** Si ves "No hay registros que coincidan" y esperabas resultados, amplíalo primero.
- **La metadata y el stack son donde está lo bueno.** El mensaje dice qué falló; el stack dice dónde y la metadata con qué datos.
- **Para pedir ayuda a una IA, usa el brief**, no un copiar y pegar de la pantalla: lleva el contexto, las reglas y los datos enmascarados.
- **Comparte la URL, no capturas.** Quien la reciba puede seguir filtrando desde ahí.
