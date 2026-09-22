# MCLog — Glosario

Términos que aparecen en la documentación, la interfaz y la API. Ordenado alfabéticamente.

---

### Access token
JWT de vida corta (**15 minutos** por defecto) que autoriza cada petición de consulta. Viaja en la cabecera `Authorization: Bearer …` o en la cookie `access_token`. Cuando caduca, el sistema lo renueva solo usando el [refresh token](#refresh-token). → [Refresh token](#refresh-token), [Auto-refresh](#auto-refresh)

### Admin
[Rol](#rol) que, además de todo lo que puede hacer un `user`, **purga logs** y administra [API keys](#api-key), usuarios, [alertas](#alerta) y el [Lab](#lab). El primero se crea automáticamente al arrancar con `ADMIN_EMAIL` / `ADMIN_PASSWORD`, y es la [cuenta root](#cuenta-root).

Ninguna API key recibe este rol, por muchos [permisos](#permiso-scope) que tenga: administrar exige una sesión de persona.

### Alerta
Aviso automático cuando se cumple una [regla](#regla-de-alerta). Se comprueban cada minuto y se envían por uno o varios [canales](#canal-de-alerta). Cada disparo queda registrado con su conteo y el resultado del envío a cada canal.

### API key
Clave secreta que autentica a las **máquinas**. Se crea desde el dashboard y viaja en `x-api-key` o en `Authorization: Bearer`.

Cada clave lleva [permisos](#permiso-scope), puede acotarse a una lista de aplicaciones y puede caducar o revocarse. De ella **solo se guarda el hash**: el secreto se muestra una única vez, al crearla.

**Consecuencia de separar los permisos:** una clave de ingesta filtrada escribe logs basura, pero no expone nada de lo almacenado. → [Ingesta](#ingesta), [Permiso](#permiso-scope)

> La clave única de la variable `API_KEY` sigue funcionando por compatibilidad con emisores antiguos, con permisos de ingesta y métricas. Está deprecada.

### Aplicación (`application`)
Nombre de la aplicación que genera el log. Es el campo principal de agrupación: el filtro del dashboard, las estadísticas y la purga selectiva funcionan sobre él. Máximo 120 caracteres. Convención: una `application` por aplicación real, y usar [`service`](#servicio-service) para los subcomponentes.

### Auto-refresh
Comportamiento por el que, cuando el [access token](#access-token) ha caducado, el servidor **no rechaza la petición**: intenta renovarlo con el [refresh token](#refresh-token) y, si lo consigue, la sirve normalmente y devuelve las cookies actualizadas. Es lo que hace que la sesión del dashboard no se corte mientras estás trabajando.

### Batch (lote)
Envío de varios logs en una sola petición HTTP (`POST /api/logs/batch`), hasta 500 por defecto. Se insertan con un único `INSERT` en base de datos. Es la forma correcta de emitir desde procesos masivos: ETL, workers, Map/Reduce de NetSuite. → [Ingesta](#ingesta)

### bcrypt
Algoritmo de hashing usado para las contraseñas de usuario, con coste 12. Las contraseñas **nunca** se guardan en claro ni son recuperables: solo se pueden restablecer.

### Búsqueda avanzada
Tarjeta de la pantalla [Registros](#registros) con seis campos que buscan **cada uno en su propio campo** del log: mensaje, servicio, host, traceId exacto, nombre y código del error. Se combinan entre sí con Y. A diferencia de la búsqueda libre (`search`), que mira en varios campos a la vez, sirve para preguntas precisas como "los `ECONNRESET` del servicio `checkout`". En la API son los parámetros `message`, `service`, `host`, `traceId`, `errorName` y `errorCode` de `GET /api/logs`.

### Caddy
Servidor web que hace de proxy inverso en el despliegue de producción con Docker Compose (opción A). Obtiene y renueva el certificado HTTPS por su cuenta, y sirve el dashboard y la API bajo el **mismo dominio**, lo que elimina el [CORS](#cors-cross-origin-resource-sharing) entre orígenes y permite cookies `SameSite=Lax`. → [DEPLOYMENT.md](DEPLOYMENT.md)

### CapRover
Plataforma de despliegue autoalojada sobre Docker, con nginx y certificados HTTPS incluidos. En la opción B de despliegue aloja la API y PostgreSQL como dos apps separadas; la API usa el `captain-definition` del backend. → [DEPLOYMENT.md](DEPLOYMENT.md#opción-b--caprover--railway)

### Canal de alerta
Destino por el que se envía una [alerta](#alerta): **webhook** (sirve para Slack, Discord, Teams o n8n), **correo** (por SMTP) o **Telegram**. Una [regla](#regla-de-alerta) puede usar varios a la vez.

Un canal caído no impide avisar por los demás, y su fallo queda registrado en el historial con el motivo.

### Código de recuperación
Uno de los **8 códigos** (formato `xxxxx-xxxxx`) que se entregan al activar la [verificación en dos pasos](#verificación-en-dos-pasos-2fa). Sustituye al código de la app si pierdes el móvil. Cada uno vale **una sola vez**, se muestran solo al activarla y se guardan como hash. Desactivar y volver a activar la verificación genera 8 nuevos.

### Cookie httpOnly
Cookie que el navegador guarda pero **JavaScript no puede leer**. MCLog guarda ahí los tokens de sesión, de modo que un ataque XSS no puede robarlos. Es también la razón por la que el frontend nunca manipula tokens directamente.

### Cooldown (silencio tras avisar)
Tiempo que una [regla de alerta](#regla-de-alerta) permanece callada después de dispararse. Sin él, un incidente de una hora generaría sesenta avisos idénticos.

Arranca **aunque el envío falle**, a propósito: reintentar cada minuto contra un [canal](#canal-de-alerta) caído solo multiplica el ruido cuando vuelva.

### CORS *(Cross-Origin Resource Sharing)*
Mecanismo del navegador que decide si una web puede llamar a una API alojada en otro dominio. En MCLog se controla con `CORS_ORIGINS`, que debe contener la URL **exacta** del dashboard. Es la causa habitual de que el dashboard "no conecte" aunque la API funcione.

### Cuenta root
La cuenta de `ADMIN_EMAIL`, creada al arrancar el servicio. Es un [admin](#admin) que **no se puede eliminar ni degradar**, ni siquiera por sí mismo, para que el servicio nunca se quede sin una puerta de entrada. Lleva la etiqueta **Root** en Usuarios. Si `ADMIN_EMAIL` cambia, la nueva cuenta pasa a ser el root y la anterior queda como admin normal.

### CSV
Formato de exportación tabular, separado por comas. Se abre directo en Excel. **No incluye la metadata**; si la necesitas, usa [NDJSON](#ndjson-newline-delimited-json). → [Exportación](#exportación)

### Debounce
Espera de 350 ms antes de lanzar la búsqueda mientras escribes en el dashboard. Sin ella se dispararía una consulta por cada tecla pulsada.

### Entorno (`environment`)
Contexto de ejecución del que procede el log: `development`, `staging` o `production`. Es un [enum](#enum) cerrado. Permite separar el ruido de desarrollo de los incidentes reales.

### Enum
Tipo con un conjunto cerrado de valores válidos. En MCLog son enums nativos de PostgreSQL: [`level`](#nivel-level) y [`environment`](#entorno-environment). Un valor fuera de la lista se rechaza con `400`.

### Exportación
Descarga masiva de logs aplicando los filtros activos, en [CSV](#csv) o [NDJSON](#ndjson-newline-delimited-json). Ignora la paginación y devuelve hasta `MAX_EXPORT_ROWS` (10 000) registros.

### Fingerprint (huella)
Identificador que agrupa las ocurrencias del **mismo fallo**. Se calcula sobre la parte estable del error: aplicación, servicio, clase, código, primer marco del [stack](#stack-trace) sin números de línea, y el mensaje con lo variable sustituido por marcadores (números, UUIDs, correos, URLs).

Es lo que convierte cuatrocientas líneas de "Timeout cobrando el pedido N" en un solo [grupo de error](#grupo-de-error) con un 400 al lado. El servidor la calcula para `error` y `warn`; un emisor puede enviar la suya para agrupar con otro criterio.

### Governance
Sistema de NetSuite que limita las unidades de cómputo que puede consumir un script. La librería SuiteScript de MCLog adjunta el **governance restante** en la metadata de cada log — un dato imposible de reconstruir después y muy útil para diagnosticar scripts que mueren a medias.

### Grupo de error
Conjunto de logs que comparten [huella](#fingerprint-huella), es decir, que son el mismo fallo repetido. La pantalla **Errores** del dashboard los lista por frecuencia, con su primera y última aparición.

**Primera aparición reciente significa error nuevo**, que casi siempre apunta a lo último que se tocó. Es la señal más barata para triar un incidente.

### HMAC
Firma criptográfica que acompaña a los avisos enviados por [webhook](#canal-de-alerta) cuando el canal tiene un secreto configurado. Viaja en la cabecera `x-mclog-signature`; el receptor la recalcula sobre el cuerpo y compara, y así comprueba que el aviso viene de MCLog y no de cualquiera que conozca la URL.

### Host
Máquina o instancia que generó el log. Si la aplicación no lo envía, el servidor rellena el hostname de la petición. Máximo 255 caracteres.

### Ingesta
La acción de **recibir y almacenar** logs: `POST /api/log` y `POST /api/logs/batch`. Se autentica con [API key](#api-key) (o JWT). Tiene su propio [rate limit](#rate-limit), independiente del de consulta, para que un dashboard intensivo no pueda frenar la entrada de logs.

### JSONB
Tipo de PostgreSQL para almacenar JSON de forma binaria y consultable. Es lo que hay detrás de [`metadata`](#metadata). Permite que cada aplicación adjunte su propia estructura sin migrar la base de datos.

### jti *(JWT ID)*
Identificador único de un [refresh token](#refresh-token). Es lo que se guarda en la tabla `RefreshToken` para poder revocarlo. Sin él, un JWT no se podría invalidar antes de que caduque.

### JWT *(JSON Web Token)*
Token firmado que transporta la identidad del usuario (id, email, [rol](#rol)) y su fecha de caducidad. El servidor solo verifica la firma: no necesita guardar sesiones. MCLog usa dos, con secretos distintos: [access](#access-token) y [refresh](#refresh-token).

### Lab
Pantalla de administración con **escenarios de prueba** que envían logs reales a MCLog (tráfico normal, error agrupado, traza distribuida, pico de incidente, error nuevo, datos sensibles y stream en vivo) y enlazan a la pantalla donde se ve el resultado. Todo va a aplicaciones con prefijo `lab-`, por defecto al entorno `development`, y se borra de una vez con **Borrar datos del lab**. Incluye un compositor de logs a medida que muestra la petición en JSON y cURL.

### MCP *(Model Context Protocol)*
Protocolo que permite a un asistente de IA usar herramientas externas. MCLog expone un servidor MCP en `POST /mcp` con ocho herramientas de investigación, de modo que Claude Code, Cursor o Claude Desktop consulten los logs por su cuenta en lugar de que se les peguen fragmentos.

Requiere una [API key](#api-key) con permiso `read`, y respeta todas sus restricciones. → [AI_INTEGRATION.md](AI_INTEGRATION.md)

### mfaToken
Token intermedio que devuelve `POST /auth/login` cuando la cuenta tiene [verificación en dos pasos](#verificación-en-dos-pasos-2fa): demuestra que la contraseña era correcta, pero **no abre sesión**. Dura 5 minutos y se canjea en `POST /auth/login/2fa` junto con un código. Se firma con un secreto y una audiencia propios, así que nunca vale como [access token](#access-token).

### Metadata
Objeto JSON **libre** que la aplicación adjunta al log: ids de registro, usuario, tiempos, stack traces… Es el campo donde suele estar la información que realmente explica un incidente. No tiene esquema fijo; la única regla es que sea un objeto (no un array). → [JSONB](#jsonb)

### Migración
Fichero SQL versionado que modifica el esquema de la base de datos. Se aplican con `npx prisma migrate deploy`, en orden y una sola vez; la imagen Docker lo hace sola al arrancar. MCLog tiene ocho: `0001_init`, `0002_enums_indexes`, `0003_auth`, `0004_perf_indexes`, `0005_api_keys`, `0006_error_fields`, `0007_alerts` y `0008_account_security`.

> Deben guardarse en **UTF-8**. En UTF-16 el motor falla con `string contains embedded null`.

### NDJSON *(Newline-Delimited JSON)*
Formato de exportación con **un objeto JSON completo por línea**. A diferencia del [CSV](#csv), **incluye la metadata**. Se procesa línea a línea sin cargar el fichero entero en memoria — ideal para `jq` o para ingerirlo en otra herramienta.

### Nivel (`level`)
Severidad del evento. [Enum](#enum) cerrado, de menor a mayor gravedad:

| Nivel | Cuándo usarlo |
|---|---|
| `debug` | Detalle de diagnóstico, normalmente solo en desarrollo |
| `info` | Eventos normales del funcionamiento esperado |
| `warn` | Algo anómalo que no ha impedido continuar |
| `error` | Un fallo real que requiere atención |

### OpenAPI / Swagger
Estándar de descripción de APIs REST. MCLog publica el suyo en `/docs` como interfaz navegable donde se pueden probar los endpoints, y en `/openapi.json` en crudo, para generar clientes y tipos.

### Paginación
División del resultado en páginas: `page` (número) y `pageSize` (tamaño, 1–200, por defecto 20). La respuesta incluye `total` y `totalPages`. Es obligatoria en las consultas JSON — no existe forma de pedir "todos los logs" de golpe.

### Permiso (scope)
Lo que puede hacer una [API key](#api-key). Son tres: `ingest` (escribir logs), `read` (consultar y usar [MCP](#mcp-model-context-protocol)) y `metrics` (leer `/metrics`). Una clave puede tener varios.

Es una escala distinta del [rol](#rol) de un usuario: ningún permiso da acceso de administración.

### Prisma
ORM que usa el backend para hablar con PostgreSQL. Genera un cliente TypeScript tipado desde `schema.prisma` y **parametriza todas las consultas**, lo que elimina la posibilidad de SQL injection.

### Prometheus
Sistema de recolección de métricas. MCLog expone las suyas en `/metrics`, protegido con una clave de permiso `metrics`: además de las del proceso (CPU, memoria, event loop), publica la duración de las peticiones, los logs ingeridos por aplicación y nivel, y las conexiones en vivo abiertas.

La duración se etiqueta por **patrón** de ruta (`/api/logs/:id`) y no por la URL concreta, que generaría una serie temporal por cada id.

### Puerto 5435
Puerto del host donde se publica PostgreSQL en desarrollo. No es el 5432 para no chocar con otra instancia en la misma máquina; dentro de Docker el puerto sigue siendo el 5432.

### Purga
Borrado de logs anteriores a una fecha (`DELETE /api/logs?before=…`), opcionalmente de una sola aplicación. Requiere rol [`admin`](#admin) y una fecha explícita, de modo que no existe forma de borrar "todo" por accidente.

Es la herramienta para limpiezas puntuales. Para el borrado continuo está la [retención](#retención) automática. → [Retención](#retención)

### Rate limit
Tope de peticiones por ventana de tiempo. MCLog tiene **tres independientes**:

| Límite | Default | Aplica a |
|---|---|---|
| `ingestLimiter` | 2000 / minuto | Envío de logs |
| `queryLimiter` | 600 / 15 minutos | Consultas, `/auth`, administración y MCP |
| `loginLimiter` | 10 / 15 minutos | Login, segundo paso del 2FA, alta/baja del 2FA y borrar la propia cuenta; solo los intentos fallidos, por IP |

Separarlos evita que un dashboard intensivo bloquee la ingesta, o al revés. Al superarlo se responde `429`.

La ingesta y las consultas se cuentan **por clave** cuando hay una, y no por IP: así una integración ruidosa no consume la cuota de las que comparten salida, algo habitual detrás de un NAT o con NetSuite. El límite es por instancia, así que al escalar horizontalmente se multiplica.

### Railway
Plataforma de despliegue gestionada. En la opción B de despliegue aloja el dashboard, construido con su `Dockerfile` y con `NEXT_PUBLIC_API_URL` apuntando a la API. → [DEPLOYMENT.md](DEPLOYMENT.md#b4-el-dashboard-railway)

### Refresh token
Token de vida larga (**14 días** por defecto) cuya única función es obtener un [access token](#access-token) nuevo. Se guarda en base de datos por su [`jti`](#jti-jwt-id), lo que permite revocarlo.

**Es de un solo uso:** cada vez que se usa, el anterior se elimina y se emite uno nuevo. Eso se llama [rotación](#rotación-de-tokens).

### Registros
Pantalla del dashboard con **solo la tabla** de logs, sin resumen ni modo en vivo, pensada para buscar y leer. Añade la [búsqueda avanzada](#búsqueda-avanzada) y abre cada log a pantalla completa, con <kbd>←</kbd> <kbd>→</kbd> para recorrer la página.

### Regla de alerta
Condición que dispara una [alerta](#alerta). Dos tipos:

| Tipo | Dispara cuando |
|---|---|
| **Umbral** | Hay N o más coincidencias en la ventana |
| **Error nuevo** | Aparece una [huella](#fingerprint-huella) vista por primera vez en la ventana |

La segunda es la más accionable tras un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes". Cada regla filtra por aplicación, entorno y nivel, y tiene su [cooldown](#cooldown-silencio-tras-avisar).

### Retención
Borrado automático de los logs más antiguos que `RETENTION_DAYS`. Se ejecuta cada hora, en lotes de 5000 filas cediendo el control entre uno y otro, para no bloquear la tabla ni competir con la ingesta.

`RETENTION_DAYS=0` la desactiva y **la tabla crece sin límite**. Con varias instancias, `SCHEDULER_ENABLED` debe quedar activo en una sola. → [Purga](#purga)

### Rol
Nivel de permiso de un **usuario**. `user` puede consultar, buscar, ver errores, estadísticas, exportar y gestionar su propia cuenta; [`admin`](#admin) además purga y administra claves, usuarios, alertas y el Lab. Sin sesión → `401`; con sesión pero rol insuficiente → `403`.

No confundir con los [permisos](#permiso-scope) de una API key, que son otra escala.

### Rotación de tokens
Práctica de invalidar el [refresh token](#refresh-token) anterior cada vez que se usa uno. Si alguien roba un refresh token y la víctima lo usa antes que el atacante, el robado ya no sirve. Es lo que convierte un robo silencioso en un fallo detectable.

### Servicio (`service`)
Subcomponente dentro de una [aplicación](#aplicación-application): un worker, un script concreto, un módulo. Si no se envía, el servidor copia el valor de `application`. Máximo 120 caracteres.

### SpanId
Identificador de una **operación concreta** dentro de una traza. Se usa junto al [traceId](#traceid): el trace es el viaje completo, el span es un tramo. Máximo 128 caracteres.

### SSE *(Server-Sent Events)*
Mecanismo por el que el servidor empuja eventos al navegador sobre una conexión HTTP abierta. Es lo que hay detrás del botón **En vivo** del dashboard (`GET /api/logs/stream`).

Se eligió frente a WebSocket porque el flujo es de un solo sentido: el servidor empuja y el cliente no habla. El navegador reconecta solo. **El bus es por instancia**: con varias réplicas, cada cliente ve los logs que entraron por la suya.

### Stack trace
Lista de llamadas que llevaron hasta la excepción, con archivo y línea. Se envía en el campo `errorStack` o dentro del objeto `error`, y el dashboard lo muestra al desplegar un log.

Es la mitad del valor de un error: el mensaje dice *qué* falló, el stack dice *dónde*. Además, su primer marco entra en la [huella](#fingerprint-huella).

### Stateless
Propiedad del backend: sesiones, claves y logs viven en PostgreSQL, no en memoria. Por eso se pueden levantar varias instancias detrás de un balanceador. Las excepciones, que son por instancia, son el [rate limit](#rate-limit), el stream en vivo ([SSE](#sse-server-sent-events)) y el planificador (`SCHEDULER_ENABLED` en una sola).

### SuiteScript
Lenguaje de scripting de NetSuite (basado en JavaScript). MCLog incluye una librería en SuiteScript 2.1 lista para subir al File Cabinet.

### Timestamp
Momento del evento, en ISO-8601. Si la aplicación no lo envía, se usa el momento de la inserción. **Conviene enviarlo** en procesos que acumulan logs para mandarlos después: si no, todos quedarán con la hora del envío en vez de la del suceso real.

### Timing-safe comparison
Comparación de secretos que tarda **lo mismo** coincidan o no. Evita que un atacante deduzca la [API key](#api-key) carácter a carácter midiendo tiempos de respuesta. En MCLog es `crypto.timingSafeEqual`.

### TOTP *(Time-based One-Time Password)*
Estándar (RFC 6238) de los códigos de 6 dígitos que cambian cada 30 segundos en apps como Google Authenticator. Se calculan a partir de un secreto compartido y la hora, por eso **el reloj del móvil tiene que estar en hora**. Es el mecanismo de la [verificación en dos pasos](#verificación-en-dos-pasos-2fa) de MCLog.

### TraceId
Identificador que **correlaciona todos los logs de una misma operación**, aunque haya pasado por varios sistemas. Si la aplicación no lo envía, el servidor genera uno por petición.

Es la herramienta más potente del dashboard: desde cualquier log con traceId, **Ver traza** abre la operación entera en orden, con el tiempo transcurrido desde el primer registro y el salto entre pasos. Ese desglose es lo que delata dónde se fue el tiempo. → [SpanId](#spanid)

### Trust proxy
Ajuste (`TRUST_PROXY=1`) que le dice a Express que confíe en las cabeceras `X-Forwarded-*` de un proxy o balanceador. Sin él, detrás de un proxy todas las peticiones parecen venir de la misma IP y el [rate limit](#rate-limit) se aplica mal.

### Verificación en dos pasos (2FA)
Segundo factor de inicio de sesión: además de la contraseña, un código [TOTP](#totp-time-based-one-time-password) de la app autenticadora del usuario o un [código de recuperación](#código-de-recuperación). Cada usuario la activa en **Mi cuenta**. Con ella activa, una contraseña robada no basta para entrar. Un admin ve quién la tiene (etiqueta **2FA**), pero no puede quitársela a otro. → [mfaToken](#mfatoken)
