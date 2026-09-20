# MCLog — Preguntas Frecuentes

Términos en el [Glosario](GLOSSARY.md) · Manual completo en [USER_GUIDE.md](USER_GUIDE.md) · Referencia técnica en [TECHNICAL.md](TECHNICAL.md)

---

## Índice

- [General](#general)
- [Enviar logs](#enviar-logs)
- [Consultar y buscar](#consultar-y-buscar)
- [Sesiones y usuarios](#sesiones-y-usuarios)
- [Alertas](#alertas)
- [Acceso para IA](#acceso-para-ia)
- [Errores concretos](#errores-concretos)
- [Operación y rendimiento](#operación-y-rendimiento)
- [Seguridad](#seguridad)
- [Desarrollo](#desarrollo)

---

## General

### ¿Qué es exactamente MCLog?
Un servicio donde **todas** tus aplicaciones mandan sus logs, y un dashboard web para buscarlos en un solo sitio. En vez de entrar por SSH a tres servidores y abrir NetSuite para reconstruir un incidente, filtras por fecha y aplicación en una pantalla.

### ¿Qué aplicaciones pueden enviar logs?
Cualquiera que pueda hacer una petición HTTP: NetSuite/SuiteScript, servicios Node.js, scripts Python, Java, PHP, un cron de bash con `curl`. No hay requisitos de lenguaje ni de plataforma.

### ¿Sustituye a mi logging actual?
No, lo complementa. Sigue escribiendo tus logs locales; MCLog es la capa **centralizada** para lo que quieres poder consultar y correlacionar desde fuera. No mandes todo: manda lo que investigarías después.

### ¿Necesito instalar alguna librería?
No. Un `POST` HTTP basta. Hay dos clientes listos por comodidad —[`@enviromentmc/mclog`](../packages/mclog/README.md) para Node y el [módulo SuiteScript](../integrations/netsuite/) para NetSuite— pero son opcionales.

### ¿Se puede usar en producción?
Sí. Tiene guardias de configuración que impiden arrancar con secretos por defecto, rate limiting, HTTPS forzable y validación estricta. Lo que **debes** añadir tú: un cron de [purga](#la-base-de-datos-crece-sin-parar-qué-hago) y backups.

---

## Enviar logs

### ¿Cuál es el mínimo que tengo que enviar?
Cuatro campos:

```json
{ "application": "mi-app", "level": "info", "environment": "production", "message": "Hola" }
```

El servidor rellena solo `service`, `host`, `traceId` y `timestamp`.

### ¿Necesito usuario y contraseña para enviar logs?
No. Enviar solo requiere la **API key** en la cabecera `x-api-key`. Los usuarios y contraseñas son únicamente para *consultar* desde el dashboard.

### ¿Qué pasa si MCLog está caído cuando mi app intenta enviar un log?
Depende de cómo lo hayas integrado:

- Con la **librería Node**: la llamada devuelve `false` y tu app continúa. No lanza excepción salvo que lo pidas con `throwOnError: true`.
- Con **fetch/curl a pelo**: eres tú quien debe capturar el error. Ponlo siempre en un `try/catch` o un `.catch()`.

La regla es innegociable: **el logging nunca debe tumbar la aplicación**.

### ¿Cuántos logs puedo mandar de golpe?
500 por petición con `POST /api/logs/batch` (configurable con `MAX_BATCH_SIZE`). Si usas `sendBatch` de la librería Node, puedes pasarle un array de cualquier tamaño: lo trocea solo.

### ¿Hay límite de peticiones?
2000 por minuto para ingesta, por defecto. Si lo superas recibes `429`. Casi siempre la solución correcta no es subir el límite, sino **agrupar en lotes**.

### ¿Qué meto en `metadata`?
Lo que necesitarías para diagnosticar el problema después: ids de registro, id de usuario, parámetros de entrada, tiempos, el mensaje de la excepción. Compacto — ids y valores, no volcados completos de registros.

### ¿Cuál es la diferencia entre `application` y `service`?
`application` es la aplicación real; `service` el subcomponente dentro de ella.

```
application: "facturacion"   service: "generador-pdf"
application: "facturacion"   service: "sync-netsuite"
```

Si no envías `service`, se copia `application`. El error típico es usar `application` para cada script: el filtro por aplicación del dashboard se vuelve inútil.

### ¿Debo enviar `timestamp` o dejar que lo ponga el servidor?
Déjalo salvo que acumules logs para enviarlos después (un batch al final de un proceso, una cola, un reintento). En ese caso **envíalo**: si no, todos quedarán con la hora del envío en lugar de la del suceso.

### ¿Puedo enviar logs desde el navegador?
Técnicamente sí, pero tendrías que exponer la API key en el código del cliente, donde cualquiera puede leerla. Manda los eventos de front a tu propio backend y que este los reenvíe a MCLog.

---

## Consultar y buscar

### El buscador, ¿dónde busca?
En el mensaje, la aplicación, el servicio y el host (coincidencia parcial, sin distinguir mayúsculas) y en el traceId (coincidencia exacta). Basta con que aparezca en uno de ellos.

### ¿Cómo sigo una operación que pasa por varios sistemas?
Con el **traceId**. Abre cualquier log de la operación, copia su traceId y pégalo en el buscador: aparece la traza completa, en orden, de todos los sistemas implicados. Para que funcione entre sistemas, tu código debe propagar el mismo traceId a los que llame.

### Filtré y no aparece nada, pero sé que hay logs
Por orden de probabilidad:

1. **El filtro de fechas.** Es el que más se queda puesto sin querer. Límpialo primero.
2. **El entorno.** Estás en `production` y el log era de `staging`.
3. **El nombre de la aplicación.** Es coincidencia parcial, pero tiene que aparecer en el nombre.

### ¿Cuántos registros puedo exportar?
Hasta 10 000 por descarga (`MAX_EXPORT_ROWS`), respetando los filtros activos. Para más, acota por rangos de fecha y haz varias descargas.

### ¿CSV o NDJSON?
**CSV** si vas a abrirlo en Excel — pero no lleva la metadata. **NDJSON** si necesitas la metadata o vas a procesarlo con herramientas: lleva el registro completo, un JSON por línea.

### ¿Puedo consultar los logs desde un script en lugar del dashboard?
Sí, pero necesitas un JWT de usuario (la API key no sirve para leer):

```bash
TOKEN=$(curl -s -X POST https://tu-api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' | jq -r .accessToken)

curl -s "https://tu-api/api/logs?level=error&pageSize=50" -H "Authorization: Bearer $TOKEN"
```

### ¿Se actualiza solo el dashboard?
Las **tarjetas de resumen** se refrescan cada 60 segundos. La **tabla** tiene un botón **En vivo**: al activarlo, los logs nuevos aparecen arriba resaltados según llegan, sin recargar.

Solo se puede activar en la primera página y con el orden por fecha descendente. En cualquier otra vista, anteponer filas nuevas mentiría sobre lo que estás mirando.

---

## Sesiones y usuarios

### ¿Cómo creo usuarios nuevos?
Desde el dashboard, en **Ajustes → Usuarios**, si tu usuario es `admin`. Puedes dar de alta, cambiar el rol, restablecer la contraseña y eliminar. El admin inicial se sigue creando solo al arrancar desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Dos operaciones están bloqueadas a propósito: nadie puede borrarse a sí mismo, ni eliminar o degradar al último administrador. Sin ellas sería posible dejar el servicio sin quien lo administre.

### ¿Qué roles hay?
`user` (consultar, buscar, estadísticas, exportar) y `admin` (todo lo anterior más purgar logs). Es el único permiso que distingue a ambos.

### Olvidé la contraseña de un usuario
Cualquier administrador puede restablecerla desde **Ajustes → Usuarios**. Si quien la ha perdido es el único administrador, no hay recuperación posible desde la aplicación (bcrypt es de una vía): hay que generar un hash nuevo y actualizar la fila a mano.

```bash
node -e "console.log(require('bcryptjs').hashSync('NuevaContraseña', 12))"
docker compose exec db psql -U postgres -d mclog -c \
  "UPDATE \"User\" SET \"passwordHash\"='<hash>' WHERE email='admin@example.com';"
```

### ¿Por qué mi sesión no caduca a los 15 minutos?
Porque el access token dura 15 minutos pero se **renueva solo** con el refresh token (14 días) mientras sigas usando la aplicación. Solo vuelves al login si dejas de usarla el tiempo suficiente para que caduque también el refresh, o si haces logout.

### ¿Puedo cerrar la sesión en todos los dispositivos?
Sí: cambia tu contraseña en **Ajustes → Mi cuenta**. Al hacerlo se revocan todos tus refresh tokens, así que las sesiones abiertas en cualquier otro dispositivo dejan de valer. Lo mismo ocurre cuando un administrador cambia la contraseña o el rol de alguien.

### ¿Por qué el frontend no guarda el token en localStorage?
Porque cualquier script inyectado podría leerlo. Los tokens viven en **cookies httpOnly**, invisibles para JavaScript. Por eso el frontend nunca manipula tokens directamente.

---

## Errores concretos

### `401 Invalid or missing API key`
La cabecera `x-api-key` falta o no coincide con `API_KEY` del backend. Verifica que no haya espacios sobrantes y que estés apuntando al entorno correcto (la clave de desarrollo no vale en producción).

### `401` al consultar logs teniendo API key
Correcto y a propósito: **la API key no da acceso de lectura**. Para consultar necesitas iniciar sesión y usar el JWT. Es la protección que hace que una clave filtrada no exponga los logs.

### `400` con una lista de `errors`
Validación. La respuesta indica el campo exacto:

```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error" } } }
```

Causas habituales: falta un obligatorio, `level`/`environment` con un valor fuera del enum, `metadata` enviada como array en vez de objeto, o `timestamp` que no es ISO-8601.

### `403 Requires role: admin`
Estás autenticado pero tu usuario es `user` y la operación (purga) requiere `admin`.

### `429 Too Many Requests`
Superaste el rate limit. En ingesta (2000/min) la solución es agrupar en lotes; en consulta (600/15 min) suele significar un script en bucle. Se pueden subir con `INGEST_RATE_LIMIT_MAX` y `RATE_LIMIT_MAX`.

### `503 degraded` en `/health`
La API responde pero **no alcanza la base de datos**. Revisa que el contenedor esté arriba (`docker compose ps`) y que `DATABASE_URL` sea correcta.

### El dashboard dice "No pudimos cargar los logs"
1. ¿Responde la API? `curl http://localhost:3000/health`
2. ¿Está bien `NEXT_PUBLIC_API_URL` en `frontend_mclog/.env.local`?
3. ¿Está el origen del dashboard en `CORS_ORIGINS` del backend, **exacto**? `http://localhost:3001` y `http://localhost:3001/` no son lo mismo.

Abre la consola del navegador: un error de CORS se ve ahí explícitamente.

### El backend no arranca y se queja de la configuración
```
Configuración insegura para producción:
 - API_KEY sigue con el valor por defecto
```
Es **intencional**. Con `NODE_ENV=production`, el servicio se niega a arrancar si quedan secretos de desarrollo o `CORS_ORIGINS` está vacío. Configura el `.env`.

### Una migración falla con `string contains embedded null`
El `.sql` se guardó en UTF-16 (le pasa a PowerShell con `>` y `Out-File`). Vuelve a guardarlo en **UTF-8**.

### La sesión se cae constantemente en producción
Las cookies no se están guardando. Con el dashboard y la API en dominios distintos necesitas HTTPS, `COOKIE_SECURE=1` y `COOKIE_SAMESITE=none`. Si comparten dominio raíz, `COOKIE_DOMAIN=.tu-dominio.com`.

---

## Alertas

### ¿Cómo me entero de que algo falla sin estar mirando el dashboard?
Con una **regla** de alerta y un **canal**, en Ajustes → Alertas. Las reglas se comprueban cada minuto.

### ¿Qué puede dispararse?
Dos cosas: que se acumulen N coincidencias en una ventana (**umbral**), o que aparezca un error **que no se había visto nunca**. La segunda es la más útil justo después de un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes".

### ¿Por dónde avisa?
Webhook (vale para Slack, Discord, Teams o n8n), correo y Telegram. Una regla puede usar varios a la vez, y hay un botón de envío de prueba en cada canal.

### ¿Cómo sé que un webhook viene de MCLog?
Pon un **secreto** al crear el canal: cada aviso viaja firmado con HMAC-SHA256 en la cabecera `x-mclog-signature`. El receptor recalcula la firma sobre el cuerpo y compara.

### Me va a inundar de avisos
Para eso está el **silencio tras avisar** de cada regla. Tras dispararse, calla el tiempo que indiques; sin él, un incidente de una hora generaría sesenta avisos idénticos. El silencio arranca aunque el envío falle, a propósito.

### Un canal ha fallado, ¿me entero?
Sí. En Ajustes → Alertas → Historial cada disparo muestra a cuántos canales se entregó y el motivo de los que fallaron. Un canal caído no impide avisar por los demás.

### ¿Hace falta configurar algo para el correo?
Solo para ese canal: las variables `SMTP_*` del backend. Webhook y Telegram se configuran enteros desde el dashboard.

---

## Acceso para IA

### ¿Cómo conecto Claude Code (o Cursor) a mis logs?
Creas una API key con permiso `read` y la registras como servidor MCP. Los pasos, con la configuración de cada cliente, están en [AI_INTEGRATION.md](AI_INTEGRATION.md).

### ¿Qué puede hacer la IA con mis logs?
Solo leer, y solo lo que alcance su clave. Dispone de ocho herramientas: inventario de aplicaciones, errores agrupados por causa, búsqueda con filtros, detalle de un log, errores recientes, traza completa, contexto alrededor de un log y estadísticas.

### ¿Puede escribir o borrar algo?
No. Una clave con permiso `read` no puede escribir logs ni purgar nada, y el endpoint MCP nunca asigna rol de administrador, así que las operaciones de administración le quedan fuera aunque las pidiera.

### ¿Por qué los errores aparecen agrupados?
Porque el mismo fallo casi nunca tiene el mismo mensaje: lleva dentro el id del pedido, un UUID o una hora. MCLog normaliza esa parte variable y calcula una huella, de modo que cuatrocientas ocurrencias de un timeout son un grupo con un 400 al lado en vez de cuatrocientas líneas indistinguibles.

### ¿Tengo que cambiar cómo envío los logs?
No es obligatorio, pero mejora mucho el resultado mandar la excepción entera en el campo `error` en lugar de solo su mensaje. Con la clase del error y el stack la agrupación es precisa. Ver [AI_INTEGRATION.md § 5](AI_INTEGRATION.md#5-que-los-logs-merezcan-la-pena).

---

## Operación y rendimiento

### La base de datos crece sin parar, ¿qué hago?
Pon `RETENTION_DAYS` en el `.env`. El servicio purga cada hora los logs más antiguos que esa ventana, en lotes de 5000 filas para no bloquear la tabla ni competir con la ingesta. También limpia los refresh tokens caducados.

`RETENTION_DAYS=0` desactiva la purga y la tabla crece sin límite, que era el comportamiento anterior. Sigue existiendo `DELETE /api/logs?before=<fecha>` para purgas puntuales.

Con varias instancias detrás de un balanceador, deja `SCHEDULER_ENABLED=1` en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

### ¿Cuántos logs aguanta?
Con los índices actuales, PostgreSQL maneja cómodamente decenas de millones de filas. A partir de ahí conviene **particionar por rango de `timestamp`**, con la ventaja de que la purga pasa a ser un `DROP PARTITION` instantáneo. La ruta completa de escalado está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).

### ¿Puedo levantar varias instancias de la API?
Sí. El backend es **stateless**: todo el estado vive en PostgreSQL. Ponlas detrás de un balanceador con `TRUST_PROXY=1` y listo. Ojo: el rate limiting es por instancia (está en memoria), así que el límite efectivo se multiplica por el número de instancias.

### ¿Cómo hago backup?
```bash
docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
```
Los datos viven en el volumen Docker `pgdata`.

### ¿Cómo monitorizo el propio servicio?
`GET /health` para uptime checks (verifica también la base) y `GET /metrics` con `x-api-key` para Prometheus. Además el servicio escribe una línea JSON por petición con `requestId`, `traceId`, status y duración.

### ¿Puedo rotar una clave sin cortar el servicio?
Sí, si usas claves creadas desde el dashboard: creas la nueva, actualizas al emisor y revocas la vieja. Durante ese rato las dos funcionan.

La excepción es la clave heredada de la variable `API_KEY`: es única, y cambiarla deja fuera a todos los emisores que aún la usen hasta que los actualices. Es una razón más para migrar a claves con permisos.

---

## Seguridad

### ¿Qué pasa si se filtra la API key?
El atacante puede **escribir logs falsos**, pero **no puede leer nada**: la API key no da acceso de consulta. Es una molestia, no una fuga de datos. Rótala cambiando `API_KEY` y actualizando los emisores.

### ¿Qué pasa si roban un refresh token?
El daño está acotado por la **rotación**: cada refresh token es de un solo uso. Si el usuario legítimo lo usa antes que el atacante, el robado queda inservible. Para cortar de raíz, borra las filas de `RefreshToken` de ese usuario.

### ¿Las contraseñas están cifradas?
Están **hasheadas** con bcrypt (coste 12), que no es reversible. Nadie —ni el administrador ni quien tenga acceso a la base— puede leer una contraseña; solo restablecerla.

### ¿Hay riesgo de SQL injection?
No por construcción: Prisma parametriza todas las consultas, y el campo de ordenación se valida contra una lista blanca en vez de interpolarse.

### ¿Se registran datos sensibles en los logs del servicio?
Con `LOG_LEVEL=debug` se registra el body de las peticiones, pero **redactando** `password`, `token`, `authorization`, `auth`, `refreshtoken` y `accesstoken`.

Cuidado con lo que tú mandas: si pones una contraseña o un token en el `message` o en `metadata` de un log tuyo, se guardará tal cual. MCLog no puede adivinar qué es secreto dentro de tu propio contenido.

### ¿Se puede restringir qué aplicación envía con cada clave?
Sí. Al crear una clave en **Ajustes → API keys** puedes limitarla a una lista de aplicaciones. La restricción vale en los dos sentidos: esa clave no puede escribir logs de otra aplicación (responde `403`) ni verlos al consultar, ni en el listado, ni en las estadísticas, ni pidiendo un log concreto por su id, que responde `404` para no confirmar siquiera que existe.

Cada clave lleva además permisos: `ingest` para escribir, `read` para consultar y `metrics` para Prometheus. Una clave de ingesta filtrada no expone nada de lo ya almacenado.

La clave única de la variable `API_KEY` sigue funcionando por compatibilidad con los emisores ya desplegados, con permisos de ingesta y métricas.

---

## Desarrollo

### ¿Cómo levanto todo en local?
[USER_GUIDE.md § C.1](USER_GUIDE.md#c1-arranque-local). Resumen: `docker compose up -d db`, `npx prisma migrate deploy`, `npm run dev` en el backend y en `frontend_mclog`.

### ¿Cómo ejecuto los tests?
```bash
cd Back_MCLog && docker compose up -d db && npm test    # 130 tests
cd packages/mclog && npm test               # 42 tests
```
Los del backend necesitan la base real en `localhost:5435` y corren en serie porque la comparten.

### ¿Por qué el puerto de PostgreSQL es 5435 y no 5432?
Para no chocar con otra instancia de PostgreSQL en tu máquina. Dentro de Docker el puerto sigue siendo 5432; el 5435 es solo el mapeo al host.

### ¿Por qué `DATABASE_URL` es distinta dentro y fuera de Docker?
Dentro de la red de Compose los contenedores se ven por nombre de servicio: `db:5432`. Desde tu máquina hay que usar el puerto publicado: `localhost:5435`. Por eso el comando de migraciones en local lleva la `DATABASE_URL` por delante.

### ¿Dónde está la documentación de la API para probarla?
En `http://localhost:3000/docs` — Swagger UI, con los endpoints ejecutables desde el navegador.

### ¿Cómo añado un campo nuevo al log?
1. Añádelo a `model Log` en [schema.prisma](../Back_MCLog/prisma/schema.prisma).
2. `npx prisma migrate dev --name add_campo` (guarda el `.sql` en UTF-8).
3. Añade su regla en [validateLog.ts](../Back_MCLog/src/middlewares/validateLog.ts).
4. Propágalo en `toCreateInput` de [logController.ts](../Back_MCLog/src/controllers/logController.ts).
5. Si debe ser filtrable, añádelo a `buildWhere` en [logService.ts](../Back_MCLog/src/services/logService.ts) y a [validateLogQuery.ts](../Back_MCLog/src/middlewares/validateLogQuery.ts).

Antes de hacerlo, considera si te basta con meterlo en `metadata`: no requiere migración ni tocar código.

### ¿Cómo publico una versión nueva de la librería?
```bash
cd packages/mclog
npm version patch          # o minor / major
npm publish                # prepublishOnly ejecuta build + tests
```
Requiere estar autenticado en npm con acceso a la organización `enviromentmc`.
