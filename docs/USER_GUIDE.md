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

Arriba tienes la barra de secciones. Las de administración solo aparecen si tu usuario es `admin`:

| Sección | Para qué |
|---|---|
| **Logs** | La tabla de registros, con filtros y descargas |
| **Errores** | Los fallos agrupados por causa. Casi siempre, el mejor sitio para empezar |
| **API keys** | Claves para que las máquinas envíen o consulten (admin) |
| **Usuarios** | Alta, roles y contraseñas (admin) |
| **Alertas** | Avisos automáticos por webhook, correo o Telegram (admin) |
| **Mi cuenta** | Tus datos y tu contraseña |

## A.2 La pantalla de logs

### Tarjetas de resumen

Cuatro números que se actualizan solos cada minuto: total de registros, volumen de las últimas 24 horas, errores y warnings acumulados, y la aplicación que más emite.

### Actividad por hora

Debajo, un gráfico de barras con el volumen de la última jornada, apilado por nivel. Los errores van abajo, pegados a la línea base, porque es la parte que se puede comparar de un vistazo entre horas.

Sirve para una pregunta concreta y muy frecuente: **¿desde cuándo pasa esto?** Si la franja roja aparece de golpe a una hora, ahí tienes el momento del incidente. Pasa el ratón por una barra para ver el desglose exacto de esa hora.

### Filtros

Se combinan entre sí: cuantos más pongas, más se acota la búsqueda. La tabla se actualiza sola.

| Filtro | Cómo funciona |
|---|---|
| **Nivel** | debug, info, warn o error |
| **Entorno** | development, staging o production |
| **Aplicación** | Escribe parte del nombre, sin necesidad del nombre exacto ni de respetar mayúsculas |
| **Buscar** | Busca a la vez en el mensaje, la aplicación, el servicio, el host y el traceId |
| **Desde / Hasta** | Rango de fecha y hora |
| **Ordenar por** | Fecha, aplicación, nivel, host o entorno, con el botón ↓/↑ para invertir |

> **Comparte lo que ves.** La dirección del navegador refleja los filtros activos. Copia la URL y pégala en un chat: quien la abra verá exactamente tu misma vista.

### En vivo

El botón **En vivo** deja la conexión abierta y va colocando arriba, resaltados, los logs según llegan. Es lo que quieres mientras reproduces un fallo o justo después de desplegar.

Solo se puede activar en la primera página y con el orden por fecha descendente. En cualquier otra vista estaría colando filas nuevas en medio de algo que no las espera, así que el botón se desactiva solo. El punto de la izquierda indica el estado: verde parpadeando es conexión viva.

### La tabla

Cada fila es un evento: fecha, aplicación, servicio, nivel, entorno y mensaje. El nivel va con color para localizarlo de un vistazo (rojo = error, ámbar = warn, azul = info, gris = debug).

**Haz clic en cualquier fila** y se despliega con el detalle completo:

- **Host** — la máquina o instancia que lo generó
- **TraceId** — el identificador para seguir la operación entre sistemas
- **Error y código** — la clase de la excepción, si la aplicación la envió
- **Huella** — el identificador del grupo al que pertenece este fallo
- **Mensaje completo** — sin recortar
- **Stack trace** — dónde se rompió exactamente, si venía en el log
- **Metadata** — el contexto en JSON que envió la aplicación

Y tres accesos directos:

| Botón | Qué hace |
|---|---|
| **Ver traza completa** | Abre la operación entera, de todos los sistemas por los que pasó |
| **Ver errores iguales** | Filtra a las demás ocurrencias de este mismo fallo |
| **Copiar JSON** | Copia el registro entero al portapapeles, para pegarlo en un ticket |

Abajo eliges cuántos registros ver por página (10, 25, 50 o 100) y navegas con Anterior / Siguiente.

### Descargar

Los botones **CSV** y **NDJSON** descargan los logs **con los filtros que tengas puestos**, no todo. Hasta 10 000 registros.

- **CSV** se abre directo en Excel, pero no incluye la metadata.
- **NDJSON** trae un JSON por línea con el registro completo, metadata incluida.

## A.3 La pantalla de errores

Aquí está la diferencia entre mirar logs y entender qué está roto.

**Cada fila es un fallo distinto, no una ocurrencia.** Si el mismo timeout ha pasado veintinueve veces, es una fila con un 29 al lado, no veintinueve líneas iguales. MCLog las agrupa aunque los mensajes lleven dentro números de pedido, identificadores o fechas distintos.

Cada fila te dice:

| Columna | Qué significa |
|---|---|
| **Veces** | Cuántas ocurrencias en la ventana elegida |
| **Error** | La clase de la excepción y su código, con un mensaje de ejemplo |
| **Aplicación** | Dónde ocurre, y en qué servicio dentro de ella |
| **Actividad** | Cuándo fue la última vez y cuándo la primera |

Ese par de fechas es lo más útil de la pantalla. **Primera aparición reciente significa error nuevo**, que casi siempre apunta a lo último que se tocó. Primera aparición antigua significa un problema que llevaba ahí tiempo.

Arriba eliges la ventana (1 hora, 24 horas, 7 o 30 días) y filtras por nivel, entorno y aplicación. Con **Ver ocurrencias** saltas a la tabla de logs filtrada a ese fallo concreto.

## A.4 La pantalla de traza

Se llega desde el botón **Ver traza completa** de cualquier log que tenga traceId.

Muestra todos los registros de una misma operación en orden cronológico, **aunque haya pasado por varias aplicaciones**, con el tiempo transcurrido desde el primero. Eso último es lo que delata dónde se fue el tiempo: si entre dos pasos hay un salto de treinta segundos, ahí está el cuello de botella.

Pulsa cualquier línea para desplegar su detalle, con stack y metadata.

## A.5 Cómo investigar un incidente

**Te avisan de un fallo en producción a las 10:30.**

1. Abre **Errores**, pon la ventana en **24 horas** y el entorno en **production**.
2. Mira la columna Actividad. Busca un fallo cuya **primera aparición** sea reciente: eso es algo que antes no pasaba.
3. Pulsa **Ver ocurrencias** para ir a los registros concretos.
4. Abre uno y lee el **stack trace**: te dice el archivo y la función exactos.
5. Si la operación cruza sistemas, pulsa **Ver traza completa** para ver qué pasó antes del fallo, incluidos los `info` que llevan hasta él.

La vieja forma (filtrar por nivel y hora en la tabla y rebuscar) sigue funcionando y a veces es lo que quieres. Pero para "qué está roto", empezar por Errores te ahorra el paso de descubrir que las cuarenta líneas que estás leyendo son el mismo problema.

## A.6 Consejos

- **El filtro de fechas es el que más se queda puesto sin querer.** Si ves "No hay registros que coincidan" y esperabas resultados, límpialo primero.
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
npm install @enviromentmc/mclog
```

```ts
import { createMCLogClient } from "@enviromentmc/mclog";

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

En **Ajustes → Usuarios**, si tu rol es `admin`. Puedes dar de alta, cambiar el rol, restablecer contraseñas y eliminar.

| Rol | Puede |
|---|---|
| `user` | Consultar, buscar, ver errores, estadísticas y exportar |
| `admin` | Todo lo anterior, más purgar logs y administrar claves, usuarios y alertas |

Cambiar la contraseña o el rol de alguien **cierra sus sesiones abiertas** en todos los dispositivos, y el rol nuevo se aplica de inmediato.

Dos operaciones están bloqueadas a propósito, para que el servicio no se quede sin administración: nadie puede borrarse a sí mismo, ni eliminar o degradar al último `admin`.

Cada quien cambia su propia contraseña en **Mi cuenta**. Hacerlo cierra también la sesión actual, así que hay que volver a entrar.

## C.4 API keys

En **Ajustes → API keys**. Cada clave lleva permisos, y conviene dar los justos:

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

En **Ajustes → Alertas**. Una **regla** define cuándo avisar y un **canal** por dónde. Se comprueban cada minuto.

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
| `401` al ingerir | Clave inexistente, revocada o caducada | Revísala en Ajustes → API keys |
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
