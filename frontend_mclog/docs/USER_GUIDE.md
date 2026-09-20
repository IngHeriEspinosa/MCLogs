# MCLog · Manual de Usuario del Dashboard

> Manual centrado en el dashboard. El manual completo del proyecto, que además cubre cómo enviar logs desde tus aplicaciones y cómo administrar el servicio, está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Términos en el [glosario](../../docs/GLOSSARY.md); dudas concretas en el [FAQ](../../docs/FAQ.md).

## Acceso

1. Abre el dashboard (en desarrollo: http://localhost:3001).
2. Inicia sesión con tu correo y contraseña. El administrador las crea; el usuario inicial es el `ADMIN_EMAIL` configurado en el backend.
3. La sesión se renueva sola mientras uses la aplicación. Si expira del todo, volverás al login automáticamente.

En la barra superior tienes las secciones. Las de administración solo aparecen si tu rol es `admin`: **Logs**, **Errores**, **API keys**, **Usuarios**, **Alertas** y **Mi cuenta**.

## Errores: por dónde empezar

Es la pantalla que responde **qué está roto**, y casi siempre el mejor punto de partida.

Cada fila es un fallo distinto, **no una ocurrencia**. Si el mismo timeout ha pasado veintinueve veces, verás una fila con un 29 al lado en lugar de veintinueve líneas iguales: MCLog las agrupa aunque los mensajes lleven dentro números de pedido o identificadores distintos.

| Columna | Qué significa |
|---|---|
| **Veces** | Ocurrencias dentro de la ventana elegida |
| **Error** | Clase de la excepción y código, con un mensaje de ejemplo |
| **Aplicación** | Dónde ocurre, y en qué servicio |
| **Actividad** | Cuándo fue la última vez, y cuándo la primera |

Ese par de fechas es lo más útil de la pantalla. **Primera aparición reciente significa error nuevo**, que casi siempre apunta a lo último que se tocó.

Arriba eliges la ventana (1 hora, 24 horas, 7 o 30 días) y filtras por nivel, entorno y aplicación. **Ver ocurrencias** te lleva a los registros concretos de ese fallo.

## Logs: la tabla

### Tarjetas de resumen

Total de registros, volumen de las últimas 24 horas, errores y warnings acumulados, y la aplicación que más emite. Se actualizan solas cada minuto.

### Actividad por hora

Un gráfico de barras con el volumen de la última jornada, apilado por nivel. Responde a **¿desde cuándo pasa esto?**: si la franja roja aparece de golpe a una hora concreta, ahí está el inicio del incidente. Pasa el ratón por una barra para ver el desglose de esa hora.

### Filtros

Se combinan entre sí y la tabla se actualiza sola:

- **Nivel**: debug, info, warn o error.
- **Entorno**: development, staging o production.
- **Aplicación**: escribe parte del nombre, sin necesidad del nombre exacto.
- **Buscar**: busca a la vez en el mensaje, la aplicación, el servicio, el host y el traceId.
- **Desde / Hasta**: rango de fecha y hora.
- **Ordenar por**: fecha, aplicación, nivel, host o entorno, con el botón ↓/↑ para invertir.

> La URL refleja los filtros activos: copia el enlace del navegador para compartir exactamente lo que estás viendo.

### En vivo

El botón **En vivo** deja la conexión abierta y va colocando arriba, resaltados, los logs según llegan. Es lo que quieres mientras reproduces un fallo o justo después de desplegar. El punto de la izquierda indica el estado: verde parpadeando es conexión viva.

Solo se activa en la primera página y con el orden por fecha descendente. En cualquier otra vista se desactiva solo, porque colar filas nuevas en medio falsearía lo que estás mirando.

### La tabla

Cada fila muestra fecha, aplicación, servicio, nivel (rojo = error, ámbar = warn, azul = info, gris = debug), entorno y mensaje.

**Haz clic en una fila** para desplegarla: host, traceId, clase y código del error, huella del grupo, mensaje completo, **stack trace** y la metadata en JSON que envió la aplicación. Además, tres accesos directos:

| Botón | Qué hace |
|---|---|
| **Ver traza completa** | Abre la operación entera, de todos los sistemas por los que pasó |
| **Ver errores iguales** | Filtra a las demás ocurrencias de este mismo fallo |
| **Copiar JSON** | Copia el registro entero al portapapeles |

Abajo cambias el tamaño de página (10/25/50/100) y navegas entre páginas.

### Exportar

**CSV** y **NDJSON** descargan los logs con los filtros activos aplicados, hasta 10 000 registros. CSV abre en Excel pero no lleva metadata; NDJSON trae el registro completo, un JSON por línea.

## Traza: seguir una operación

Se llega con **Ver traza completa** desde cualquier log que tenga traceId.

Muestra todos los registros de una misma operación en orden cronológico, **aunque haya pasado por varias aplicaciones**, con el tiempo transcurrido desde el primero. Si entre dos pasos hay un salto de treinta segundos, ahí está el cuello de botella. Pulsa cualquier línea para desplegar su detalle.

## Secciones de administración

Solo visibles con rol `admin`. El procedimiento completo está en [docs/USER_GUIDE.md § Parte C](../../docs/USER_GUIDE.md#parte-c--administrar-el-servicio).

| Sección | Para qué |
|---|---|
| **API keys** | Crear claves para que las máquinas envíen o consulten, con permisos y alcance por aplicación. El secreto se muestra **una sola vez** |
| **Usuarios** | Alta, cambio de rol, reseteo de contraseña y baja |
| **Alertas** | Canales (webhook, correo, Telegram), reglas e historial de avisos |

## Mi cuenta

Tus datos y el cambio de contraseña. Cambiarla **cierra la sesión en todos los dispositivos**, incluido el actual, así que tendrás que volver a entrar.

## Consejos

- **Empieza por Errores**, no por Logs, salvo que ya sepas qué buscas.
- **Primera aparición reciente = sospechoso principal.** Es la señal más barata que tienes para triar.
- **El filtro de fechas es el que más se queda puesto sin querer.** Si ves "No hay registros que coincidan" y esperabas resultados, límpialo primero.
- **La metadata y el stack son donde está lo bueno.** El mensaje dice qué falló; el stack dice dónde y la metadata con qué datos.
- **Comparte la URL, no capturas.** Quien la reciba puede seguir filtrando desde ahí.
