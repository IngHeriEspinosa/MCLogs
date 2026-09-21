# MCLog — Manual de Usuario

Este manual cubre los tres perfiles que usan MCLog:

- **[Parte A — Consultar logs](#parte-a--consultar-logs-dashboard)**: para quien investiga incidentes desde el dashboard. No requiere conocimientos técnicos.
- **[Parte B — Enviar logs](#parte-b--enviar-logs-desde-tu-aplicación)**: para quien integra una aplicación.
- **[Parte C — Administrar](#parte-c--administrar-el-servicio)**: para quien opera el servicio.

Si no sabes qué significa alguna palabra, está en el [Glosario](GLOSSARY.md). Si algo no funciona, mira el [FAQ](FAQ.md).

---

# Parte A — Consultar logs (dashboard)

## A.1 Entrar

1. Abre el dashboard. En desarrollo: **http://localhost:3001**
2. Escribe tu correo y contraseña. Te las da el administrador del servicio.
3. Entras directo a la pantalla de logs.

**Sobre tu sesión:** se renueva sola mientras estés usando la aplicación, así que no te va a echar en mitad de una investigación. Si dejas la pestaña abandonada mucho tiempo, al volver te llevará al login.

A la izquierda tienes el menú de secciones (en el móvil se abre con el botón ☰). Las de administración solo aparecen si tu usuario es `admin`:

| Sección | Para qué |
|---|---|
| **Logs** | Resumen, gráfico de actividad y la tabla de registros, con filtros y descargas |
| **Errores** | Los fallos agrupados por causa. Casi siempre, el mejor sitio para empezar |
| **Reportes** | Informes en Markdown y briefs para agentes de IA |
| **Alertas** | Avisos automáticos por webhook, correo o Telegram (admin) |
| **API keys** | Claves para que las máquinas envíen o consulten (admin) |
| **Usuarios** | Alta, roles y contraseñas (admin) |
| **Mi cuenta** | Tus datos, tus preferencias y tu contraseña |

Arriba a la derecha, en todas las pantallas, cambias el **idioma** (español / inglés) y el **tema** (claro, oscuro o el de tu sistema). Se recuerdan en ese navegador.

## A.2 La pantalla de logs

### Filtros

Una sola fila encima de todo. Se combinan entre sí, y el resumen y la tabla se actualizan solos.

| Filtro | Cómo funciona |
|---|---|
| **Rango de tiempo** | Rangos rápidos (15 minutos, 1 hora… 30 días, todo el histórico) o un rango a medida en el calendario, con hora de inicio y fin |
| **Buscar** | Busca a la vez en el mensaje, la aplicación, el servicio, el host y el traceId. La tecla <kbd>/</kbd> te lleva directo al buscador |
| **Nivel** | debug, info, warn o error |
| **Entorno** | development, staging o production |
| **Aplicación** | Lista con buscador. También puedes escribir parte de un nombre que no esté en la lista |

**Limpiar filtros** los quita todos salvo el rango. El orden (fecha, aplicación, nivel, host o entorno) se cambia en la cabecera de la tabla.

> **Comparte lo que ves.** La dirección del navegador refleja los filtros activos. Copia la URL y pégala en un chat: quien la abra verá exactamente tu misma vista.

### Resumen

- **Tarjetas**: registros, errores y warnings del rango con su tendencia, fallos distintos y aplicaciones activas.
- **Actividad**: un gráfico de barras con el volumen del rango, apilado por nivel. Los errores van abajo, pegados a la línea base, porque es la parte que se puede comparar de un vistazo entre barras. Responde a una pregunta concreta y muy frecuente: **¿desde cuándo pasa esto?** Si la franja roja aparece de golpe, ahí tienes el momento del incidente. Pasa el ratón para ver el desglose exacto; **arrastra sobre el gráfico para acotar el rango** a esa franja, o haz clic en una barra para aislarla. **Ver como tabla** da las mismas cifras en filas.
- **Por nivel y por entorno**, **fallos principales** y **aplicaciones más activas**. Un clic en cualquiera lo convierte en filtro.

El resumen respeta el rango, la aplicación y el entorno, pero no la búsqueda ni el nivel. Puedes ocultarlo con el botón del panel, arriba, para dejarle todo el sitio a la tabla.

### En vivo

El botón **En vivo** deja la conexión abierta y va colocando arriba, resaltados, los logs según llegan. Es lo que quieres mientras reproduces un fallo o justo después de desplegar.

Solo se puede activar en la primera página, con el orden por fecha descendente y un rango que llegue hasta ahora. En cualquier otra vista estaría colando filas nuevas en medio de algo que no las espera, así que el botón se desactiva solo. El punto indica el estado: verde palpitando es conexión viva.

### La tabla

Cada fila es un evento: hora con milisegundos, nivel, aplicación y servicio, entorno y mensaje; en pantallas anchas, también host y traza. Una barra a la izquierda lleva el color del nivel (rojo = error, ámbar = warn, azul = info, gris = debug). En la cabecera eliges el orden, la densidad (cómoda o compacta) y cuántos registros por página (10, 25, 50 o 100).

**Haz clic en cualquier fila** (o muévete con las flechas y pulsa Intro) para abrir su detalle. En pantallas de 1920 px o más aparece como una columna junto a la tabla, y puedes seguir recorriéndola con las flechas; en pantallas más pequeñas se abre por encima y se cierra con <kbd>Esc</kbd>. Incluye:

- **Mensaje completo**, sin recortar
- **Propiedades**: aplicación, servicio, host, traceId, error y código, huella e ID
- **Stack trace**, con las líneas de tu propio código resaltadas y las de librerías atenuadas
- **Metadata**: el contexto en JSON que envió la aplicación
- **Contexto**: lo que pasó en la misma aplicación dos minutos antes y después

Y cuatro accesos directos:

| Botón | Qué hace |
|---|---|
| **Ver traza** | Abre la operación entera, de todos los sistemas por los que pasó |
| **Fallos iguales** | Filtra a las demás ocurrencias de este mismo fallo |
| **Copiar JSON** | Copia el registro entero al portapapeles, para pegarlo en un ticket |
| **Copiar para IA** | Copia un brief con el log y su contexto, listo para un agente de IA, con los datos sensibles enmascarados |

### Exportar

El botón **Exportar** descarga los logs **con los filtros que tengas puestos**, no todo, hasta 10 000 registros:

- **CSV** se abre directo en Excel, pero no incluye la metadata.
- **NDJSON** trae un JSON por línea con el registro completo, metadata incluida.

Desde el mismo menú, **Informe Markdown** y **Brief para agentes IA** abren la pantalla de Reportes con tu rango y ámbito, y lo generan al momento.

## A.3 La pantalla de errores

Aquí está la diferencia entre mirar logs y entender qué está roto.

**Cada fila es un fallo distinto, no una ocurrencia.** Si el mismo timeout ha pasado veintinueve veces, es una fila con un 29 al lado, no veintinueve líneas iguales. MCLog las agrupa aunque los mensajes lleven dentro números de pedido, identificadores o fechas distintos.

Encima de la lista, cuatro cifras: fallos distintos, ocurrencias totales, la aplicación más afectada y cuánto pesa el fallo principal sobre el total. Cada fila te dice:

| Columna | Qué significa |
|---|---|
| **Veces** | Cuántas ocurrencias en el rango, y qué parte del total son |
| **Fallo** | La clase de la excepción y su código, con un mensaje de ejemplo y la huella |
| **Aplicación** | Dónde ocurre, y en qué servicio dentro de ella |
| **Actividad** | Cuándo fue la última vez y la primera dentro del rango |

Ese par de fechas es lo más útil de la pantalla. **Primera aparición reciente suele significar error nuevo**, que casi siempre apunta a lo último que se tocó. Es la primera vez *dentro del rango elegido*: amplíalo a 30 días antes de darlo por nuevo.

Arriba eliges el rango, **Errores** o **Warnings**, el entorno y la aplicación. Con **Ver ocurrencias** saltas a la tabla de logs filtrada a ese fallo, y el botón ✦ copia un brief para IA del fallo con su ejemplo más reciente.

## A.4 La pantalla de traza

Se llega desde el botón **Ver traza** del detalle de cualquier log que tenga traceId.

Muestra todos los registros de una misma operación en orden cronológico, **aunque haya pasado por varias aplicaciones**. Cada línea lleva el tiempo desde el primer registro y el salto desde el anterior (Δ), y a la derecha una pista con la duración total: el tramo coloreado es el tiempo entre un paso y el siguiente. Eso es lo que delata dónde se fue el tiempo: si un tramo ocupa media pista, ahí está el cuello de botella.

Pulsa cualquier línea para desplegar su detalle, con stack y metadata. Arriba, **Descargar .md** guarda la traza como documento y **Copiar para IA** la prepara para un agente.

## A.5 Reportes

La pantalla **Reportes** genera documentos a partir de los logs de un rango:

| Tipo | Para quién |
|---|---|
| **Informe Markdown** | Personas: hallazgos clave en prosa, métricas, actividad, niveles, aplicaciones, fallos con su stack y errores recientes |
| **Brief para agentes IA** | Un agente de IA: instrucciones (rol, objetivo, pasos, reglas y formato de respuesta), las herramientas MCP de MCLog para seguir investigando y los datos en bloques estructurados |
| **Datos para agentes (JSON)** | Pipelines y herramientas: lo mismo que el brief, en un objeto JSON con esquema estable |

Eliges el rango, la aplicación y el entorno, las secciones y cuántos fallos incluir. Para los briefs de IA, además, el **objetivo** (triaje, regresión tras un despliegue o resumen de incidente) y, si quieres, instrucciones propias. El idioma del reporte se elige aparte del de la interfaz.

**Enmascarar datos sensibles** oculta correos, IPs, tokens y claves antes de exportar. Viene activado en los formatos de IA: mantenlo así si el reporte va a un modelo externo. Las huellas y los traceId se conservan, porque el agente los necesita para seguir investigando.

La vista previa muestra el documento formateado o el Markdown tal cual, con su tamaño y una estimación de tokens. **Copiar** y **Descargar** son los únicos momentos en que sale algo de tu navegador.

## A.6 Cómo investigar un incidente

**Te avisan de un fallo en producción a las 10:30.**

1. Abre **Errores**, pon el rango en **Últimas 24 horas** y el entorno en **production**.
2. Mira la columna Actividad. Busca un fallo cuya **primera aparición** sea reciente: eso es algo que antes no pasaba.
3. Pulsa **Ver ocurrencias** para ir a los registros concretos.
4. Abre uno y lee el **stack trace**: te dice el archivo y la función exactos. El **contexto** te enseña qué pasó justo antes.
5. Si la operación cruza sistemas, pulsa **Ver traza** para ver qué pasó antes del fallo, incluidos los `info` que llevan hasta él.
6. Si quieres una segunda opinión, **Copiar para IA** o un **Brief para agentes IA** desde Reportes le dan a un agente todo el contexto, sin datos sensibles.

La vieja forma (filtrar por nivel y hora en la tabla y rebuscar) sigue funcionando y a veces es lo que quieres. Pero para "qué está roto", empezar por Errores te ahorra el paso de descubrir que las cuarenta líneas que estás leyendo son el mismo problema.

## A.7 Consejos

- **El rango de tiempo es el filtro que más se queda puesto sin querer.** Si ves "No hay registros que coincidan" y esperabas resultados, amplíalo primero.
- **Empieza por Errores, no por Logs**, salvo que ya sepas qué buscas.
- **Primera aparición reciente = sospechoso principal.** Es la señal más barata que tienes.
- **La metadata es donde está lo bueno.** El mensaje dice *qué* falló; la metadata suele decir *con qué datos*.
- **Comparte la URL, no capturas de pantalla.** Quien la reciba puede seguir filtrando desde ahí.

---

# Parte B — Enviar logs desde tu aplicación

Guía completa con ejemplos por lenguaje en [INTEGRATION.md](INTEGRATION.md). Resumen:

## B.1 Lo que necesitas

- La **URL** del servicio (ej. `https://mclog.tu-dominio.com`)
- Una **API key con permiso `ingest`**, que te da el administrador desde el dashboard.

No necesitas usuario ni contraseña para enviar logs: eso es solo para consultar. Pide que la clave venga **acotada a tu aplicación**: así, si se filtra, no puede escribir en nombre de otra ni leer nada.

## B.2 La forma más simple

```bash
curl -X POST https://mclog.tu-dominio.com/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "application": "mi-app",
    "level": "info",
    "environment": "production",
    "message": "Proceso completado"
  }'
```

Solo esos cuatro campos son obligatorios. El servidor rellena el resto.

## B.3 Registrar un error como es debido

Esta es la parte que más rendimiento da. Manda la excepción entera en el campo `error`, no solo su mensaje:

```json
{
  "application": "facturacion",
  "level": "error",
  "environment": "production",
  "message": "Timeout en la pasarela de pagos",
  "traceId": "req-8842",
  "error": { "name": "TimeoutError", "code": "ETIMEDOUT", "stack": "..." },
  "metadata": { "pedidoId": 991 }
}
```

Con la clase y el stack, MCLog agrupa las repeticiones del mismo fallo. Sin ellos, cada mensaje con un id distinto parece un problema diferente y la pantalla de errores pierde casi todo su valor.

## B.4 Desde Node.js

```bash
npm install @multicomputos-srl/mclog
```

```ts
import { createMCLogClient } from "@multicomputos-srl/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "mi-servicio",
  environment: "production",
});

await mclog.info("Servidor iniciado");

// En un catch: extrae clase, codigo y stack por ti
try {
  await cobrar(pedido);
} catch (err) {
  await mclog.captureException(err, { metadata: { pedidoId: pedido.id } });
}
```

Si MCLog está caído, **tu aplicación no se rompe**: la llamada devuelve `false` y sigue adelante.

## B.5 Desde NetSuite

Sube el módulo de [integrations/netsuite/](../integrations/netsuite/) al File Cabinet y úsalo desde tus scripts:

```js
const appLog = mclog.createLogger({ application: 'MiSuiteApp', environment: 'production' });

try {
    crearFactura();
} catch (e) {
    appLog.exception('Fallo al crear la factura', e, { recordId: id });
}
```

Adjunta solo el `scriptId`, `deploymentId`, `accountId`, `userId` y el governance restante, y con `exception` añade la clase del error y el stack para que se agrupe.

## B.6 Reglas de oro

1. **Nunca bloquees tu aplicación por el logging.** Si el servicio de logs cae, tu app debe seguir.
2. **Manda la excepción entera**, no solo su mensaje. Es lo que permite agrupar.
3. **Usa lotes en procesos masivos.** Una petición de 500 logs, no 500 peticiones. Es lo que hace `sendBatch`.
4. **Usa `traceId`** si la operación cruza varios sistemas: pásalo entre ellos y podrás reconstruir la traza completa.
5. **Una `application` por aplicación real**, y `service` para el subcomponente. Si todo se llama igual, el filtro por aplicación deja de servir.
6. **Metadata compacta**: ids y valores relevantes, no volcados completos de registros.
7. **La API key es un secreto.** Si se filtra, pide que la revoquen; crear la sustituta no corta el servicio.

---

# Parte C — Administrar el servicio

## C.1 Arranque local

Requisitos: Node.js 20+ y Docker Desktop. Puertos libres: 3000, 3001 y 5435.

```bash
# 1. Base de datos
cd Back_MCLog
docker compose up -d db

# 2. Backend
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev                    # http://localhost:3000

# 3. Dashboard (otra terminal)
cd ../frontend_mclog
npm install
npm run dev                    # http://localhost:3001
```

Comprueba que responde: `curl http://localhost:3000/health`.

Entra en http://localhost:3001 con el `ADMIN_EMAIL` / `ADMIN_PASSWORD` de tu `.env` (por defecto `admin@example.com` / `ChangeMe123!`).

## C.2 Despliegue en producción

El procedimiento completo, con requisitos, DNS, certificados y resolución de problemas, está en **[DEPLOYMENT.md](DEPLOYMENT.md)**. En resumen:

```bash
cd deploy
cp .env.example .env     # rellena dominio, secretos y contraseñas
docker compose -f docker-compose.prod.yml up -d --build
```

Levanta base de datos, API, dashboard, copias de seguridad y un proxy Caddy que obtiene el certificado HTTPS por su cuenta. **Solo Caddy publica puertos**; lo demás queda en la red interna.

> **Si el arranque falla quejándose de la configuración, es a propósito.** El servicio se niega a arrancar en producción con secretos por defecto o sin CORS configurado. Corrige el `.env` y vuelve a intentarlo.

## C.3 Usuarios

En **Administración → Usuarios**, si tu rol es `admin`. Puedes dar de alta, cambiar el rol, restablecer contraseñas y eliminar.

| Rol | Puede |
|---|---|
| `user` | Consultar, buscar, ver errores, estadísticas y exportar |
| `admin` | Todo lo anterior, más purgar logs y administrar claves, usuarios y alertas |

Cambiar la contraseña o el rol de alguien **cierra sus sesiones abiertas** en todos los dispositivos, y el rol nuevo se aplica de inmediato.

Dos operaciones están bloqueadas a propósito, para que el servicio no se quede sin administración: nadie puede borrarse a sí mismo, ni eliminar o degradar al último `admin`.

Cada quien cambia su propia contraseña en **Mi cuenta**. Hacerlo cierra también la sesión actual, así que hay que volver a entrar.

## C.4 API keys

En **Administración → API keys**. Cada clave lleva permisos, y conviene dar los justos:

| Permiso | Para |
|---|---|
| `ingest` | Aplicaciones que envían logs |
| `read` | Asistentes de IA e integraciones que consultan |
| `metrics` | Prometheus |

Puedes además **acotarla a una lista de aplicaciones** y ponerle caducidad. La restricción vale en los dos sentidos: esa clave no puede escribir logs de otra aplicación ni verlos al consultar.

**El secreto se muestra una sola vez, al crearla.** En la base de datos solo queda su hash, así que no hay forma de recuperarlo: cópialo en ese momento.

**Rotar una clave no corta el servicio:** creas la nueva, actualizas al emisor y revocas la vieja. Durante ese rato las dos funcionan.

> La clave única de la variable `API_KEY` sigue funcionando por compatibilidad con emisores antiguos, con permisos de ingesta y métricas. Está deprecada: no se puede rotar sin cortar ni acotar por aplicación. Migra a claves del dashboard cuando puedas.

## C.5 Alertas

En **Administración → Alertas**. Una **regla** define cuándo avisar y un **canal** por dónde. Se comprueban cada minuto.

**Reglas.** Dos tipos:

| Tipo | Dispara cuando |
|---|---|
| **Umbral** | Hay N o más coincidencias en la ventana |
| **Error nuevo** | Aparece un fallo que no se había visto nunca |

La segunda es la más útil justo después de un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes".

Cada regla filtra por aplicación, entorno y nivel, y lleva un **silencio tras avisar**. Sin él, un incidente de una hora te mandaría sesenta avisos idénticos. El silencio arranca aunque el envío falle, a propósito: reintentar cada minuto contra un canal caído solo multiplica el ruido cuando vuelva.

**Canales.** Webhook (sirve para Slack, Discord, Teams o n8n), correo y Telegram. Cada uno tiene un botón de **Enviar prueba**: úsalo al configurarlo, porque te dice el motivo exacto si algo falla.

En un webhook puedes poner un **secreto**: cada aviso viaja firmado con HMAC-SHA256 en la cabecera `x-mclog-signature`, para que el receptor compruebe que viene de MCLog. El correo necesita las variables `SMTP_*` del backend; webhook y Telegram se configuran enteros desde el dashboard.

**Historial.** La tercera pestaña muestra cada disparo con su conteo y a cuántos canales llegó, y el motivo de los que fallaron.

## C.6 Acceso para asistentes de IA

MCLog expone un servidor MCP en `/mcp`, de modo que Claude Code, Cursor o Claude Desktop puedan investigar los logs por su cuenta en lugar de que les pegues fragmentos.

Crea una clave con permiso `read` y sigue **[AI_INTEGRATION.md](AI_INTEGRATION.md)**. Se desactiva con `MCP_ENABLED=0`.

## C.7 Retención de logs

Pon `RETENTION_DAYS` en el `.env` y olvídate: cada hora se purgan los logs más antiguos que esa ventana, en lotes para no bloquear la tabla ni competir con la ingesta. También se limpian los refresh tokens caducados.

`RETENTION_DAYS=0` desactiva la purga y **la tabla crece sin límite**.

Con varias instancias detrás de un balanceador, deja `SCHEDULER_ENABLED=1` en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

Para una purga puntual, por ejemplo vaciar una aplicación concreta, sigue existiendo el borrado manual:

```bash
TOKEN=$(curl -s -X POST https://tu-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@...","password":"***"}' | jq -r .accessToken)

curl -X DELETE "https://tu-api/api/logs?before=2026-01-01T00:00:00Z&application=pruebas" \
  -H "Authorization: Bearer $TOKEN"
# → {"deleted": 12345}
```

Requiere rol `admin`. Una API key no puede purgar, por muchos permisos que tenga.

## C.8 Monitoreo

| Qué | Cómo |
|---|---|
| **Salud** | `GET /health` comprueba servidor y base de datos, e informa de versión y tiempo en marcha. Apúntalo desde tu uptime check |
| **Métricas** | `GET /metrics` con una clave de permiso `metrics`. Formato Prometheus |
| **Logs del servicio** | Consola en JSON y `logs/app.log` (rotación 10 MB × 5). Una línea por petición con `requestId`, `traceId`, status y duración |
| **Detalle extra** | `LOG_LEVEL=debug` añade el body de las peticiones, con contraseñas y tokens redactados |

Además de las métricas del proceso, se publican `http_request_duration_seconds` por método, ruta y estado, `mclog_logs_ingested_total` por aplicación y nivel, y `mclog_sse_connections` con las conexiones en vivo abiertas.

## C.9 Backups

En producción, el servicio `backup` hace un `pg_dump` diario en `deploy/backups/` y conserva los últimos catorce. Para forzar uno ahora:

```bash
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
```

Restaurar (sobrescribe los datos actuales y pide confirmación):

```bash
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml run --rm backup \
  /scripts/restore.sh /backups/mclog_2026-09-19_030000.dump
docker compose -f docker-compose.prod.yml start api
```

> **Las copias viven en el mismo disco que la base.** Si pierdes el disco, las pierdes con él. Cópialas fuera del servidor con `rclone` o `rsync` en cron.

## C.10 Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `401` al ingerir | Clave inexistente, revocada o caducada | Revísala en Administración → API keys |
| `403` al ingerir | La clave no tiene permiso `ingest`, o el log es de una aplicación fuera de su alcance | La respuesta indica las aplicaciones permitidas |
| `403` al consultar | La clave no tiene permiso `read` | Las claves de ingesta no pueden leer, por diseño |
| `429 Too Many Requests` | Superado el límite de ingesta | Agrupa con `/api/logs/batch` antes de subir `INGEST_RATE_LIMIT_MAX` |
| `400` al ingerir | Falta un campo obligatorio, o level/environment inválido | La respuesta trae `errors` con el detalle campo por campo |
| El arranque falla en producción | Secretos por defecto o `CORS_ORIGINS` vacío | Es la validación de seguridad. Configura el `.env` |
| El dashboard no conecta (CORS) | Origen no listado | Añade la URL **exacta** del front a `CORS_ORIGINS` |
| No llegan los avisos | Canal mal configurado o caído | Usa **Enviar prueba**, y mira el historial de alertas |
| El botón En vivo no se activa | No estás en la primera página, o el orden no es por fecha descendente | Es a propósito |
| La base no está disponible al arrancar | PostgreSQL aún iniciando | La API reintenta 10 veces en 30 s. Revisa `docker compose ps` |
| Migración falla con "embedded null" | El `.sql` se guardó en UTF-16 | Vuelve a guardarlo en UTF-8 |
| Sesión que se cae constantemente | Cookies bloqueadas | Con front y API en dominios distintos, necesitas HTTPS, `COOKIE_SECURE=1` y `COOKIE_SAMESITE=none`. Con Caddy y un solo dominio, esto no pasa |

Más casos en el [FAQ](FAQ.md).
