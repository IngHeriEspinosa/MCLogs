# MCLog — Funcionalidades

Desglose completo de lo que hace el sistema, funcionalidad por funcionalidad. Cada bloque indica **qué hace**, **quién puede usarlo**, **dónde vive en el código** y **cómo se usa**.

Para el detalle técnico de parámetros y respuestas, ver [TECHNICAL.md](TECHNICAL.md). Para el uso desde el dashboard, ver [USER_GUIDE.md](USER_GUIDE.md).

---

## Índice

1. [Ingesta de logs](#1-ingesta-de-logs)
2. [Consulta y búsqueda](#2-consulta-y-búsqueda)
3. [Estadísticas](#3-estadísticas)
4. [Exportación](#4-exportación)
5. [Retención y purga](#5-retención-y-purga)
6. [Autenticación y sesiones](#6-autenticación-y-sesiones)
7. [Autorización por roles](#7-autorización-por-roles)
8. [Dashboard web](#8-dashboard-web)
9. [Clientes de integración](#9-clientes-de-integración)
10. [Observabilidad del propio servicio](#10-observabilidad-del-propio-servicio)
11. [Protecciones de seguridad](#11-protecciones-de-seguridad)
12. [Documentación de API interactiva](#12-documentación-de-api-interactiva)
13. [API keys con permisos](#13-api-keys-con-permisos)
14. [Gestión de usuarios](#14-gestión-de-usuarios)
15. [Agrupación de errores](#15-agrupación-de-errores)
16. [Acceso para IA (MCP)](#16-acceso-para-ia-mcp)
17. [Mantenimiento automático](#17-mantenimiento-automático)
18. [Alertas](#18-alertas)
19. [Logs en vivo](#19-logs-en-vivo)
20. [Verificación en dos pasos (2FA)](#20-verificación-en-dos-pasos-2fa)
21. [Lab de pruebas](#21-lab-de-pruebas)

---

## 1. Ingesta de logs

Recibe y almacena eventos de cualquier aplicación capaz de hacer una petición HTTP.

**Quién:** aplicaciones emisoras, autenticadas con una API key de permiso `ingest` (o con JWT de usuario, que es como envía el Lab).
**Código:** [logRoutes.ts](../Back_MCLog/src/routes/logRoutes.ts) → [validateLog.ts](../Back_MCLog/src/middlewares/validateLog.ts) → [logController.ts](../Back_MCLog/src/controllers/logController.ts) → [logService.ts](../Back_MCLog/src/services/logService.ts)

### 1.1 Log individual — `POST /api/log`

Inserta un evento. Devuelve `201` con el registro creado (incluido su `id`).

```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" -H "x-api-key: $MCLOG_API_KEY" \
  -d '{"application":"facturacion","level":"error","environment":"production",
       "message":"Timeout en pasarela de pagos","metadata":{"orderId":991}}'
```

### 1.2 Lote — `POST /api/logs/batch`

Inserta hasta `MAX_BATCH_SIZE` (500 por defecto) eventos en **un solo `INSERT`** (Prisma `createMany`). Devuelve `{ "created": n }`.

Pensado para procesos masivos —Map/Reduce de NetSuite, ETL, workers—: 1 petición de 500 logs en lugar de 500 peticiones. Si el array supera el tope, responde `400` con el límite en el mensaje.

### 1.3 Contrato del evento

| Campo | Obligatorio | Límite | Default del servidor |
|---|---|---|---|
| `application` | ✅ | 120 chars | — |
| `level` | ✅ | `debug`\|`info`\|`warn`\|`error` | — |
| `environment` | ✅ | `development`\|`staging`\|`production` | — |
| `message` | ✅ | 100 000 chars (se recorta) | — |
| `service` | — | 120 chars | el valor de `application` |
| `host` | — | 255 chars | hostname de la petición |
| `timestamp` | — | ISO-8601 | momento de la inserción |
| `traceId` | — | 128 chars | UUID generado por petición |
| `spanId` | — | 128 chars | — |
| `metadata` | — | objeto JSON libre | — |
| `errorName` / `errorCode` / `errorStack` | — | 200 / 100 / 50 000 chars (se recortan) | — |
| `error` | — | objeto con `name`/`message`/`code`/`stack` | se reparte en los tres anteriores ([15.1](#151-detalle-estructurado-del-error)) |
| `fingerprint` | — | 64 chars | calculada para `error` y `warn` ([15.2](#152-huella)) |

`message`, `errorStack` (50 000), `errorName` (200) y `errorCode` (100) **se recortan** a su tope, terminando en `…`, en vez de rechazarse: su tamaño depende de lo que pase en ejecución, y rechazarlos tumbaba el lote entero. La longitud original queda en `metadata.mclogTruncated`, p. ej. `{ "errorStack": 84211 }`. El resto de topes se siguen validando con `400`.

### 1.4 Enriquecimiento automático

El servidor **completa** lo que la aplicación no envía: `service`, `host` y `traceId` se rellenan solos ([`toCreateInput`](../Back_MCLog/src/controllers/logController.ts)). Una app puede enviar únicamente los 4 campos obligatorios y aun así obtener registros útiles y correlacionables.

### 1.5 Metadata libre

`metadata` es un campo **JSONB sin esquema**: cada aplicación adjunta el contexto que necesite (ids de registro, usuario, stack trace, tiempos) sin que haya que migrar la base de datos. La única validación es que sea un objeto (no un array).

---

## 2. Consulta y búsqueda

`GET /api/logs` — listado paginado con filtros combinables. **Requiere JWT o una API key con permiso `read`**: una clave de ingesta nunca da acceso de lectura.

**Código:** [validateLogQuery.ts](../Back_MCLog/src/middlewares/validateLogQuery.ts) → [logController.ts](../Back_MCLog/src/controllers/logController.ts) → [`buildWhere`](../Back_MCLog/src/services/logService.ts)

### 2.1 Filtros

| Filtro | Comportamiento |
|---|---|
| `application`, `service`, `host` | Coincidencia parcial, **insensible a mayúsculas** (`contains`) |
| `traceId`, `fingerprint` | Coincidencia **exacta** |
| `level`, `environment` | Valor exacto del enum |
| `from` / `to` | Rango ISO-8601, **combinables** en una sola condición sobre `timestamp` |
| `search` | Busca en `message`, `application`, `service`, `host` (parcial) **y** `traceId` (exacto), unidos por `OR` |
| `message`, `errorName`, `errorCode` | **Búsqueda avanzada**: cada uno en su propio campo, coincidencia parcial e insensible a mayúsculas |

Todos son opcionales y se acumulan con `AND`.

### 2.1.1 Búsqueda libre frente a búsqueda avanzada

`search` responde a "¿aparece este texto en algún sitio?": es rápida de escribir, pero un `timeout` puede coincidir con el mensaje de un log y con el nombre de un host a la vez. La **búsqueda avanzada** responde a preguntas precisas, como "errores `ECONNRESET` del servicio `checkout` cuyo mensaje dice `pago`": cada parámetro mira un solo campo y todos se combinan con `AND`.

En el dashboard es la tarjeta **Búsqueda avanzada** de la pantalla **Registros**, con seis campos: mensaje, servicio, host, traceId exacto, nombre y código del error.

### 2.2 Paginación

`page` (≥1, default 1) y `pageSize` (1–200, default 20). La respuesta trae los metadatos completos:

```json
{ "data": [...], "page": 1, "pageSize": 20, "total": 1543, "totalPages": 78 }
```

El listado y el conteo se ejecutan en **una transacción** para que el total sea coherente con la página devuelta.

### 2.3 Ordenación

`sort=<campo>:<asc|desc>`, con campos permitidos `timestamp`, `application`, `level`, `host`, `environment`. Default `timestamp:desc`. Un campo no permitido cae silenciosamente a `timestamp` (lista blanca, no interpolación).

### 2.4 Detalle individual — `GET /api/logs/:id`

Devuelve un registro completo con toda su metadata. `400` si el id no es numérico, `404` si no existe.

---

## 3. Estadísticas

`GET /api/logs/stats` — agregados calculados en la base de datos, no en memoria.

**Código:** [`getLogStats`](../Back_MCLog/src/services/logService.ts)

| Métrica | Contenido |
|---|---|
| `total` | Total de logs almacenados |
| `last24h` | Logs de las últimas 24 horas |
| `byLevel` | Conteo por nivel (debug/info/warn/error) |
| `byApplication` | **Top 10** de aplicaciones más activas |
| `byEnvironment` | Conteo por entorno |
| `timeline` | Serie por hora y nivel, acotada con `hours` o `from`/`to` (y `application`, `environment`) |

Las consultas se lanzan en paralelo con `Promise.all`. El dashboard las refresca cada 60 segundos.

---

## 4. Exportación

`GET /api/logs?format=csv` o `format=ndjson` — descarga masiva **respetando los filtros activos**.

**Código:** [`getLogs`](../Back_MCLog/src/controllers/logController.ts) → [`exportLogs`](../Back_MCLog/src/services/logService.ts)

- **CSV** — cabecera `id, timestamp, application, service, host, level, environment, message, traceId`, con escapado correcto de comillas, comas y saltos de línea. Abre directo en Excel.
- **NDJSON** — un objeto JSON completo por línea, **incluida la metadata**. Ideal para `jq`, ingestión en otra herramienta o procesado por streaming.

No pagina: devuelve hasta `MAX_EXPORT_ROWS` (10 000 por defecto) filas, o menos si se pasa `pageSize`. Es un tope explícito para no agotar la memoria del proceso con una consulta abierta.

---

## 5. Retención y purga

`DELETE /api/logs?before=<ISO>[&application=<nombre>]` — borra logs anteriores a una fecha, opcionalmente de una sola aplicación.

**Quién:** solo usuarios con rol **`admin`**.
**Código:** [`purgeLogs`](../Back_MCLog/src/controllers/logController.ts) → [`deleteLogsBefore`](../Back_MCLog/src/services/logService.ts)

`before` es obligatorio y debe ser ISO-8601 — no existe forma de borrar "todo" por accidente. Devuelve `{ "deleted": n }` y deja constancia de la operación en los logs del servicio.

> La tabla `Log` **crece sin límite** si no se purga. Lo normal es dejarlo en manos de la retención automática (`RETENTION_DAYS`, ver [17](#17-mantenimiento-automático)); esta operación queda para limpiezas puntuales. Ver [USER_GUIDE.md](USER_GUIDE.md#c7-retención-de-logs).

---

## 6. Autenticación y sesiones

Dos planos completamente separados, por diseño:

| Plano | Quién | Mecanismo | Puede leer |
|---|---|---|---|
| **Ingesta** | Máquinas (NetSuite, scripts, servicios) | API key con permiso `ingest` | ❌ No |
| **Consulta automatizada** | Asistentes de IA, integraciones | API key con permiso `read` | ✅ Solo sus aplicaciones |
| **Consulta y administración** | Personas (dashboard) | JWT access + refresh, con segundo factor opcional | ✅ Sí |

**Consecuencia de seguridad:** si una clave de ingesta se filtra, el atacante puede *escribir* logs basura, pero **no puede leer** los de nadie. Detalle de los permisos en [13](#13-api-keys-con-permisos).

**Código:** [authService.ts](../Back_MCLog/src/services/authService.ts), [requireAuth.ts](../Back_MCLog/src/middlewares/requireAuth.ts), [authApiKey.ts](../Back_MCLog/src/middlewares/authApiKey.ts)

### 6.1 Login — `POST /auth/login`

Email + contraseña (bcrypt, coste 12). Devuelve los tokens por **tres vías** simultáneas: body JSON, headers `x-access-token`/`x-refresh-token` y **cookies httpOnly** — así sirve tanto a un navegador como a un script.

Si la cuenta tiene la **verificación en dos pasos** activa, la contraseña correcta no abre la sesión: la respuesta es `{ mfaRequired: true, mfaToken }` y hay que completar `POST /auth/login/2fa` con un código antes de 5 minutos. Ver [20](#20-verificación-en-dos-pasos-2fa).

Los intentos fallidos están limitados a 10 cada 15 minutos por IP (`LOGIN_RATE_LIMIT_*`); los correctos no cuentan, así que un usuario legítimo nunca se bloquea a sí mismo.

### 6.2 Refresh con rotación — `POST /auth/refresh`

Cada refresh token se persiste por su `jti` en la tabla `RefreshToken`. Al usarlo:

1. Se valida la firma y que el registro exista, no esté revocado y no haya expirado.
2. **Se elimina el registro anterior** y se emite un par nuevo.

Es decir, un refresh token **es de un solo uso**. Si alguien roba uno y la víctima lo usa antes, el robado deja de servir.

### 6.3 Auto-refresh transparente

Cuando el access token expira, [`requireAuth`](../Back_MCLog/src/middlewares/requireAuth.ts) **no devuelve 401 directamente**: intenta refrescar con el refresh token (header o cookie), y si lo consigue, sirve la petición y renueva las cookies en la misma respuesta. El usuario nunca ve un corte de sesión mientras esté activo.

### 6.4 Logout — `POST /auth/logout`

Revoca el refresh token en base de datos y limpia las cookies. Idempotente: un token inválido no produce error.

### 6.5 Administrador inicial: la cuenta root

Al arrancar, si `ADMIN_EMAIL` y `ADMIN_PASSWORD` están definidos y el usuario no existe, se crea con rol `admin` ([`ensureAdminUser`](../Back_MCLog/src/services/authService.ts)). No hay que sembrar la base a mano.

Esa cuenta es la **root** del servicio: nadie puede eliminarla ni quitarle el rol `admin`, tampoco ella misma, así que el servicio nunca se queda sin una puerta de entrada. En cada arranque se le devuelve el rol si lo hubiera perdido. Si `ADMIN_EMAIL` cambia, la nueva cuenta pasa a ser el root y la anterior queda como un admin normal. `ADMIN_PASSWORD` solo se usa al crearla: no pisa una contraseña cambiada después.

---

## 7. Autorización por roles

**Código:** [requireRole.ts](../Back_MCLog/src/middlewares/requireRole.ts)

| Rol | Puede |
|---|---|
| `user` | Consultar, buscar, ver estadísticas, exportar, generar reportes y gestionar su propia cuenta |
| `admin` | Todo lo anterior **+ purgar logs** (`DELETE /api/logs`), API keys, usuarios, alertas y el Lab |

Sin sesión → `401`. Con sesión pero rol insuficiente → `403`.

---

## 8. Dashboard web

Aplicación Next.js 14 en el puerto 3001. Manual completo en [USER_GUIDE.md](USER_GUIDE.md).

**Código:** [frontend_mclog/src/](../frontend_mclog/src/)

| Funcionalidad | Detalle |
|---|---|
| **Portada** | Página pública en `/` con acceso al login; con sesión abierta lleva directo a Logs |
| **Login** | Formulario email/contraseña y, si la cuenta tiene 2FA, un segundo paso con el código de la app o de recuperación. Tras entrar, vuelve a la página que se pidió. El front nunca manipula tokens (viven en cookies httpOnly) |
| **Español / inglés** | Toda la interfaz traducida; el cambio es inmediato y se recuerda |
| **Tema claro / oscuro / sistema** | Sin destello al cargar; con "sistema" sigue al sistema operativo |
| **Hasta 4K** | La interfaz escala y aprovecha el ancho hasta 3840 px; el detalle del log pasa a columna lateral desde 1920 px |
| **Resumen** | Registros, errores, warnings, fallos distintos y aplicaciones del rango, con tendencia; por nivel, por entorno, fallos principales y apps más activas |
| **Gráfico de actividad** | Columnas apiladas por nivel; arrastrar acota el rango, clic aísla un intervalo, vista de tabla alternativa |
| **Filtros combinables** | Rango de tiempo (rápidos o calendario con horas), nivel, entorno, aplicación con buscador y búsqueda libre |
| **Búsqueda con debounce** | 350 ms de espera: no lanza una consulta por cada tecla |
| **Ordenación** | Por fecha, aplicación, nivel, host o entorno, asc/desc |
| **Paginación** | 10 / 25 / 50 / 100 por página, con navegación anterior/siguiente |
| **Inspector del log** | Propiedades, stack con el código propio resaltado, metadata, contexto de ±2 min y "Copiar para IA"; navegable con flechas |
| **Registros** | La tabla sin resumen, con **búsqueda avanzada** por campo (mensaje, servicio, host, traceId exacto, nombre y código del error) y el detalle del log a pantalla completa, con ←/→ para recorrer la página |
| **Errores** | Fallos agrupados por huella, con conteo, primera y última aparición y brief para IA |
| **Traza** | Una operación entre sistemas en línea temporal, con los saltos de tiempo entre pasos |
| **Administración** | API keys, usuarios (con etiquetas Root y 2FA), alertas y el **Lab** de pruebas (ver [21](#21-lab-de-pruebas)) |
| **Mi cuenta** | Preferencias, cambio de contraseña, verificación en dos pasos y eliminar la propia cuenta |
| **Badges por severidad** | Color por nivel para localizar errores de un vistazo |
| **Export** | CSV y NDJSON con los filtros activos |
| **Reportes** | Informe Markdown para personas, brief para agentes de IA (Markdown) y datos en JSON; enmascarado de correos, IPs y tokens |
| **Filtros en la URL** | `?range=7d&level=error&application=x`, incluida la búsqueda avanzada (`&errorCode=ECONNRESET`) — copiar el enlace reproduce la vista exacta |
| **Estados de carga** | Skeletons al cargar; al refiltrar se mantiene la tabla anterior atenuada (sin parpadeo) |
| **Sesión automática** | Un 401 dispara un reintento vía `/auth/refresh`; si falla, redirige a `/login` |

---

## 9. Clientes de integración

No hace falta ningún cliente —basta un `POST` HTTP— pero hay dos listos para usar. Guía completa en [INTEGRATION.md](INTEGRATION.md).

### 9.1 Librería Node.js — `@multicomputos-srl/mclog`

**Código:** [packages/mclog/](../packages/mclog/)

Paquete npm publicable, con **cero dependencias en runtime** (usa `fetch` nativo, Node ≥18):

- `createMCLogClient()` con helpers `debug` / `info` / `warn` / `error`, `send`, `sendBatch` y `captureException`.
- **Troceado automático** de lotes al tamaño máximo del servidor, por entradas y por bytes.
- **Reintentos** ante fallos transitorios (red, timeout, `429`, `5xx`) con espera exponencial y jitter.
- **A prueba de fallos**: si MCLog no responde, la función devuelve `false` y tu aplicación sigue. No escribe en tu consola; puedes engancharte con `onError` o pedir excepciones con `throwOnError`.
- Defaults de aplicación, entorno, servicio, host y metadata para no repetirlos en cada llamada.
- Entry point aparte `@multicomputos-srl/mclog/express` con el middleware `validateLog`, para que quien solo emita logs no arrastre Express.

### 9.2 Librería NetSuite — SuiteScript 2.1

**Código:** [integrations/netsuite/](../integrations/netsuite/)

Módulo para subir al File Cabinet. Adjunta automáticamente en `metadata` el `scriptId`, `deploymentId`, `executionContext`, `accountId`, `userId`, `userRole` y el **governance restante** — contexto que en NetSuite es caro de reconstruir después. `exception()` reparte un `SuiteScriptError` en campos de error para que se agrupe. Incluye ejemplos de User Event y Map/Reduce.

---

## 10. Observabilidad del propio servicio

Quién vigila al vigilante. **Código:** [app.ts](../Back_MCLog/src/app.ts), [logger.ts](../Back_MCLog/src/config/logger.ts), [requestLogger.ts](../Back_MCLog/src/middlewares/requestLogger.ts)

| Endpoint / mecanismo | Qué aporta |
|---|---|
| `GET /health` | Verifica servidor **y** base de datos (`SELECT 1`). `200 ok` / `503 degraded`. Para load balancers y uptime checks |
| `GET /metrics` | Métricas Prometheus del proceso (CPU, memoria, event loop), duración de peticiones, logs ingeridos por aplicación y nivel, y conexiones en vivo. **Protegido con API key** de permiso `metrics` |
| Log por petición | Una línea JSON con `requestId`, `traceId`, método, URL, status y duración en ms. Los `/health` correctos se omiten para no ahogar el resto |
| Redacción de secretos | Con `LOG_LEVEL=debug` también registra el body, pero redacta `password`, `token`, `authorization`, `auth`, `refreshtoken`, `accesstoken` |
| Fichero rotado | `logs/app.log`, 10 MB × 5 ficheros |
| Reintentos de arranque | Si la base no está lista, reintenta 10 veces cada 3 s antes de rendirse |
| Apagado ordenado | `SIGTERM`/`SIGINT` cierran el servidor y desconectan Prisma; salida forzada a los 10 s |

---

## 11. Protecciones de seguridad

**Código:** [app.ts](../Back_MCLog/src/app.ts), [env.ts](../Back_MCLog/src/config/env.ts), [middlewares/](../Back_MCLog/src/middlewares/)

| Protección | Implementación |
|---|---|
| **Cabeceras HTTP** | `helmet` con su configuración por defecto |
| **CORS** | Lista blanca desde `CORS_ORIGINS`, con credenciales. Peticiones sin `Origin` (curl, health checks) permitidas |
| **Rate limiting triple** | `ingestLimiter` 2000/min, `queryLimiter` 600/15 min y `loginLimiter` 10 fallos/15 min, **independientes**: un dashboard intensivo no puede bloquear la ingesta, ni al revés, y el login resiste la fuerza bruta |
| **Límite de cuerpo** | 3 MB (`BODY_LIMIT`) |
| **API key en tiempo constante** | `crypto.timingSafeEqual`, para no filtrar la clave por diferencias de tiempo |
| **Verificación en dos pasos** | TOTP con códigos de recuperación, anti-reutilización de códigos; ver [20](#20-verificación-en-dos-pasos-2fa) |
| **Cuentas protegidas** | La cuenta root y el último admin no se pueden eliminar ni degradar |
| **Cookies** | `httpOnly` siempre; `secure` y `sameSite` configurables; `secure` automático en producción |
| **HTTPS forzable** | `FORCE_HTTPS=1` rechaza peticiones no cifradas (salvo las de loopback, que es el healthcheck del contenedor) |
| **Validación en el borde** | `express-validator` en cada endpoint: tipos, enums, longitudes y formatos ISO |
| **Sin SQL injection** | Prisma parametriza todo; la ordenación usa lista blanca, no interpolación |
| **Guardia de producción** | `assertProductionConfig()` **impide arrancar** con `NODE_ENV=production` si quedan secretos o contraseñas de ejemplo, si los dos secretos JWT son iguales o si `CORS_ORIGINS` está vacío |

---

## 12. Documentación de API interactiva

`GET /docs` — Swagger UI (OpenAPI 3) generado desde [swagger.ts](../Back_MCLog/src/config/swagger.ts). Permite explorar y probar los endpoints desde el navegador sin escribir un curl. `GET /openapi.json` entrega la misma especificación en crudo, para generar clientes.

---

## 13. API keys con permisos

Credenciales para máquinas, administrables desde el dashboard.

**Quién:** solo `admin`. **Código:** [apiKeyService.ts](../Back_MCLog/src/services/apiKeyService.ts) · [apiKeyRoutes.ts](../Back_MCLog/src/routes/apiKeyRoutes.ts) · [authApiKey.ts](../Back_MCLog/src/middlewares/authApiKey.ts)

| Permiso | Permite |
|---|---|
| `ingest` | Enviar logs |
| `read` | Consultar logs, errores y estadísticas, y usar el servidor MCP |
| `metrics` | Leer `/metrics` |

Una clave puede llevar varios permisos, acotarse a una lista de aplicaciones, caducar en una fecha y revocarse. Se acepta en `x-api-key` o en `Authorization: Bearer`, porque los clientes MCP solo permiten cabeceras estándar.

**Solo se guarda el hash.** El secreto viaja en claro una única vez, al crear la clave. Una filtración de la base de datos no entrega ninguna clave utilizable.

**El aislamiento vale en los dos sentidos.** Una clave acotada a `facturacion` recibe `403` si intenta escribir logs de `ventas`, y al consultar no ve esos registros ni en el listado, ni en las estadísticas, ni pidiendo el log por su id, que responde `404` para no confirmar siquiera que existe.

**Ninguna clave recibe rol `admin`.** Purgar logs o administrar el servicio requiere una sesión de persona.

> La clave única de la variable `API_KEY` sigue funcionando con permisos `ingest` y `metrics`, para no romper los emisores ya desplegados. Está deprecada: no se puede rotar sin cortar el servicio ni acotar por aplicación.

---

## 14. Gestión de usuarios

**Código:** [userService.ts](../Back_MCLog/src/services/userService.ts) · [authRoutes.ts](../Back_MCLog/src/routes/authRoutes.ts)

| Operación | Quién |
|---|---|
| `GET /auth/me` | Cualquier sesión. Se relee de base de datos, no del JWT: el rol puede haber cambiado |
| `PATCH /auth/me/password` | Cada uno la suya. Mínimo 8 caracteres y distinta de la actual |
| `POST /auth/me/2fa/*` | Cada uno la suya. Verificación en dos pasos con app autenticadora (TOTP) y códigos de recuperación |
| `DELETE /auth/me` | Cada uno la suya, con contraseña y código 2FA. **La cuenta root (`ADMIN_EMAIL`) no se puede eliminar ni degradar** |
| Alta, cambio de rol, reseteo de contraseña y baja | `admin` |

Cambiar la contraseña o el rol de alguien **revoca todos sus refresh tokens**: las sesiones abiertas en otros dispositivos dejan de valer y el nuevo rol se aplica en el siguiente token.

Tres operaciones están bloqueadas para que el servicio no se quede sin administración:

- nadie puede borrarse a sí mismo desde la administración de usuarios (para eso está `DELETE /auth/me`);
- nadie puede eliminar ni degradar la cuenta **root** (`403`);
- nadie puede eliminar ni degradar al último `admin` (`409`).

Desde **Mi cuenta**, cada usuario puede **eliminar su propia cuenta**. Le pide su contraseña, el código 2FA si lo tiene activo, y escribir `ELIMINAR`. Sus sesiones desaparecen con él; las API keys que creó siguen funcionando.

---

## 15. Agrupación de errores

Lo que convierte cuatrocientas líneas iguales en un problema con nombre y conteo.

**Código:** [fingerprint.ts](../Back_MCLog/src/utils/fingerprint.ts) · [analysisService.ts](../Back_MCLog/src/services/analysisService.ts)

### 15.1 Detalle estructurado del error

La ingesta acepta `errorName`, `errorCode` y `errorStack`, o un objeto `error` con `name`, `message`, `code` y `stack` que se reparte en esos campos. Si no se envía `message`, se toma el de la excepción. Un código numérico se guarda como texto, y un stack en array (formato de NetSuite) se une en una cadena.

### 15.2 Huella

Para los niveles `error` y `warn`, el servidor calcula una huella con la parte **estable** del fallo: aplicación, servicio, clase, código, primer marco del stack sin números de línea, y el mensaje normalizado. La normalización sustituye por marcadores lo que cambia entre ocurrencias: números, UUIDs, correos, URLs y cadenas entrecomilladas.

Con eso, «Timeout cobrando el pedido 991» y «Timeout cobrando el pedido 1428» son el mismo grupo. Un emisor puede mandar su propia `fingerprint` si prefiere otro criterio.

### 15.3 Consultas de investigación

| Endpoint | Responde |
|---|---|
| `GET /api/logs/errors/groups` | **Qué está fallando**, por frecuencia, con primera y última aparición |
| `GET /api/logs?fingerprint=…` | Las ocurrencias concretas de un grupo |
| `GET /api/logs/trace/:traceId` | Una operación completa, aunque cruce aplicaciones |
| `GET /api/logs/:id/context` | Lo ocurrido justo antes y después de un log |
| `GET /api/logs/applications` | Qué aplicaciones existen, con sus servicios y errores recientes |

En el dashboard esto son la vista **Errores** y la vista de **Traza**, y en la tabla de logs el filtro por huella con enlaces a la traza y a los errores iguales.

---

## 16. Acceso para IA (MCP)

`POST /mcp` expone un servidor **Model Context Protocol**: un asistente como Claude Code, Cursor o Claude Desktop consulta los logs con herramientas propias en vez de que le peguen fragmentos a mano.

**Quién:** JWT o API key con permiso `read`. **Código:** [mcp/server.ts](../Back_MCLog/src/mcp/server.ts) · [mcp/router.ts](../Back_MCLog/src/mcp/router.ts). Guía completa en [AI_INTEGRATION.md](AI_INTEGRATION.md).

| Herramienta | Para qué |
|---|---|
| `list_applications` | Inventario de aplicaciones |
| `get_error_groups` | Qué está fallando, agrupado por causa |
| `search_logs` | Búsqueda con filtros y paginación |
| `get_log` | Registro completo, con stack y metadata |
| `get_recent_errors` | Últimos errores sin agrupar |
| `get_trace` | Operación completa por `traceId` |
| `get_log_context` | Lo ocurrido alrededor de un log |
| `get_stats` | Totales y serie por hora |

Dos decisiones gobiernan las respuestas: los listados van **recortados y sin metadata**, porque todo lo devuelto consume contexto del modelo y solo `get_log` entrega el registro entero; y cuando hay más resultados de los devueltos **se dice explícitamente**, para que el modelo no concluya que ya lo ha visto todo.

El endpoint es **sin estado**: cada petición se atiende y se cierra, así que el servicio sigue escalando horizontalmente. Los límites de la clave se aplican dentro: una clave acotada no ve otras aplicaciones en ninguna herramienta. Se apaga con `MCP_ENABLED=0`.

---

## 17. Mantenimiento automático

**Código:** [jobs/scheduler.ts](../Back_MCLog/src/jobs/scheduler.ts)

| Trabajo | Cada | Qué hace |
|---|---|---|
| Retención | 1 h | Borra los logs más antiguos que `RETENTION_DAYS` |
| Limpieza de sesiones | 6 h | Elimina los refresh tokens caducados |

La purga va en **lotes de 5000 filas** cediendo el control entre uno y otro: un único `DELETE` sobre millones de filas bloquearía la tabla y competiría con la ingesta. Se ejecuta también al arrancar, para recuperar el mantenimiento pendiente si el servicio estuvo caído.

`RETENTION_DAYS=0` desactiva la purga y la tabla crece sin límite. Con varias instancias detrás de un balanceador, `SCHEDULER_ENABLED=1` debe quedar en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

---

## 18. Alertas

Avisar sin que nadie tenga que estar mirando el dashboard.

**Quién:** solo `admin`. **Código:** [evaluator.ts](../Back_MCLog/src/alerts/evaluator.ts) · [notifiers/](../Back_MCLog/src/alerts/notifiers/) · [alertRoutes.ts](../Back_MCLog/src/routes/alertRoutes.ts)

### 18.1 Reglas

Una **regla** define cuándo avisar. Se comprueban todas cada minuto.

| Tipo | Dispara cuando |
|---|---|
| `threshold` | Hay N o más coincidencias en la ventana |
| `new_error_group` | Aparece una huella de error **vista por primera vez** en la ventana |

La segunda es la señal más accionable tras un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes".

Cada regla filtra por aplicación, servicio, entorno y nivel mínimo (`error`, o `warn` y `error`), y lleva un **cooldown**: tras avisar se calla el tiempo indicado. Sin él, un incidente de una hora generaría sesenta avisos idénticos.

### 18.2 Canales

Un **canal** define por dónde avisar. Una regla puede usar varios.

| Tipo | Configuración | Notas |
|---|---|---|
| `webhook` | `url` y `secret` opcional | Sirve para Slack, Discord, Teams o n8n. Con `secret`, cada aviso va firmado con HMAC-SHA256 en `x-mclog-signature` |
| `email` | `to` (lista) | El servidor SMTP se configura con las variables `SMTP_*` |
| `telegram` | `botToken` y `chatId` | Mensaje en MarkdownV2 |

Los secretos **se guardan pero no se devuelven**: al listar llegan enmascarados, y reenviar la máscara al editar conserva el valor original.

Hay un botón de **envío de prueba** por canal. Un canal que falla responde `200` con `ok: false` y el motivo: el fallo es justo el dato que se está pidiendo.

### 18.3 Entrega e historial

Cada disparo queda registrado con su conteo, una muestra de los logs que lo provocaron y el resultado por canal. Un canal caído no impide avisar por los demás ni frena la evaluación de las otras reglas, y **el cooldown arranca aunque el envío falle**: reintentar cada minuto contra un canal caído solo multiplica el ruido cuando vuelva.

El aviso incluye un enlace al dashboard con los filtros de la regla puestos, si hay `PUBLIC_DASHBOARD_URL` configurada.

---

## 19. Logs en vivo

`GET /api/logs/stream` emite los logs según se ingieren, por Server-Sent Events. En el dashboard es el botón **En vivo** de la tabla, que antepone las filas nuevas resaltadas.

**Código:** [logEvents.ts](../Back_MCLog/src/events/logEvents.ts) · [streamController.ts](../Back_MCLog/src/controllers/streamController.ts)

Se eligió SSE y no WebSocket porque el flujo es de un solo sentido: el servidor empuja y el cliente no habla. SSE va sobre HTTP normal, el navegador lo reconecta solo y atraviesa los proxys sin nada especial, siempre que el proxy no acumule la respuesta (en el Caddyfile de producción está resuelto).

Acepta los mismos filtros de nivel, aplicación y entorno, y respeta el alcance de la API key. El stream lleva solo la cabecera del log, sin metadata ni stack: para el detalle se pide el registro.

**Dos límites que conviene conocer:**

- El bus de eventos es **por instancia**. Con varias réplicas, cada cliente ve solo los logs que entraron por la suya. Hacerlo global pide `LISTEN/NOTIFY` de PostgreSQL o un Redis, y a esta escala no compensa.
- Hay un tope de conexiones simultáneas (`SSE_MAX_CONNECTIONS`, 50 por defecto); al superarlo se responde `503`.

El modo en vivo solo se activa en la primera página y con el orden por fecha descendente: en cualquier otra vista, anteponer filas nuevas mentiría sobre lo que se está mirando.

---

## 20. Verificación en dos pasos (2FA)

Una contraseña robada ya no basta para entrar: además hace falta el código de 6 dígitos que genera el móvil del usuario.

**Quién:** cualquier usuario, sobre su propia cuenta. **Código:** [twoFactorService.ts](../Back_MCLog/src/services/twoFactorService.ts) · [totp.ts](../Back_MCLog/src/utils/totp.ts) · [TwoFactorCard.tsx](../frontend_mclog/src/components/organisms/TwoFactorCard.tsx)

| Paso | Qué ocurre |
|---|---|
| **Alta** | En **Mi cuenta**, el usuario escanea un QR con su app (Google Authenticator, Microsoft Authenticator, 1Password…) y confirma con un código. Recibe **8 códigos de recuperación**, que se muestran una sola vez |
| **Login** | Tras la contraseña, la pantalla pide el código. Vale el de la app o uno de recuperación |
| **Baja** | Pide la contraseña y un código |

Detalles de diseño:

- **TOTP estándar** (RFC 6238: SHA1, 6 dígitos, 30 s), implementado en el propio servicio sin dependencias. El QR también se genera en el servidor, como SVG: el secreto no pasa por ningún servicio externo.
- **Un código no se puede reutilizar**: se guarda el último paso aceptado, con una actualización atómica que impide que dos peticiones simultáneas con el mismo código ganen las dos.
- **Códigos de recuperación de un solo uso**, guardados como hash, que se comparan sin distinguir mayúsculas ni guiones.
- **El token intermedio** (`mfaToken`, 5 min) tiene secreto y audiencia propios: no sirve como sesión.
- **Límite de intentos**: el segundo paso, el alta y la baja comparten el limitador del login (10 fallos / 15 min por IP).
- **Sin puerta trasera**: un admin ve quién tiene el 2FA activo (etiqueta **2FA** en Usuarios) pero no puede desactivarlo en otra cuenta. La recuperación sin códigos es un procedimiento de base de datos documentado en la [guía de operación](../Back_MCLog/docs/USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

---

## 21. Lab de pruebas

Una forma de ver MCLog funcionando **sin esperar a que algo falle**: escenarios que envían logs reales y enlazan a la pantalla donde se ve el resultado.

**Quién:** solo `admin`. **Código:** [app/lab/](../frontend_mclog/src/app/lab/) · [common/lab/](../frontend_mclog/src/common/lab/) · [useLab.ts](../frontend_mclog/src/hooks/useLab.ts)

| Escenario | Qué demuestra |
|---|---|
| Tráfico normal | Resumen, gráfico de actividad y filtros con 120 registros variados |
| Error agrupado | 25 timeouts con datos distintos → **una** fila en Errores |
| Traza distribuida | Una operación por cuatro servicios con el mismo traceId, que falla al final |
| Pico de incidente | 80 errores en 5 minutos → pico en Actividad y disparo de reglas de umbral |
| Error nuevo | Una huella nunca vista → reglas de tipo "Error nuevo" |
| Datos sensibles | Correos, IPs y tokens ficticios → que los briefs para IA los enmascaran |
| Stream en vivo | 20 logs uno a uno → el modo **En vivo** de Logs |

Además, un **compositor** envía un log a medida y muestra la petición equivalente en JSON y cURL, útil como plantilla de integración.

- Todo va a aplicaciones con prefijo `lab-`.
- Por defecto se envía al entorno `development`, para no contaminar métricas ni alertas de producción.
- **Borrar datos del lab** limpia solo esas aplicaciones.
- La ingesta usa la sesión del admin: no hace falta crear una API key para probar.

## Resumen de endpoints

| Método | Ruta | Auth | Funcionalidad |
|---|---|---|---|
| `POST` | `/api/log` | Clave `ingest` o JWT | [1.1](#11-log-individual--post-apilog) |
| `POST` | `/api/logs/batch` | Clave `ingest` o JWT | [1.2](#12-lote--post-apilogsbatch) |
| `GET` | `/api/logs` | Clave `read` o JWT | [2](#2-consulta-y-búsqueda) · [4](#4-exportación) |
| `GET` | `/api/logs/stats` | Clave `read` o JWT | [3](#3-estadísticas) |
| `GET` | `/api/logs/:id` | Clave `read` o JWT | [2.4](#24-detalle-individual--get-apilogsid) |
| `GET` | `/api/logs/errors/groups` | Clave `read` o JWT | [15.3](#153-consultas-de-investigación) |
| `GET` | `/api/logs/trace/:traceId` | Clave `read` o JWT | [15.3](#153-consultas-de-investigación) |
| `GET` | `/api/logs/:id/context` | Clave `read` o JWT | [15.3](#153-consultas-de-investigación) |
| `GET` | `/api/logs/applications` | Clave `read` o JWT | [15.3](#153-consultas-de-investigación) |
| `DELETE` | `/api/logs` | JWT **admin** | [5](#5-retención-y-purga) |
| `POST` | `/mcp` | Clave `read` o JWT | [16](#16-acceso-para-ia-mcp) |
| `GET` | `/api/logs/stream` | Clave `read` o JWT | [19](#19-logs-en-vivo) |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/alerts/channels` · `/rules` · `/events` | JWT **admin** | [18](#18-alertas) |
| `GET`/`POST`/`DELETE` | `/api/keys` | JWT **admin** | [13](#13-api-keys-con-permisos) |
| `GET`/`PATCH`/`DELETE` | `/auth/me` · `/auth/me/password` | JWT | [14](#14-gestión-de-usuarios) |
| `POST` | `/auth/me/2fa/setup` · `/enable` · `/disable` | JWT | [20](#20-verificación-en-dos-pasos-2fa) |
| `GET`/`POST`/`PATCH`/`DELETE` | `/auth/users` | JWT **admin** | [14](#14-gestión-de-usuarios) |
| `POST` | `/auth/login` · `/auth/login/2fa` · `/auth/refresh` · `/auth/logout` | — | [6](#6-autenticación-y-sesiones) |
| `GET` | `/health` | — | [10](#10-observabilidad-del-propio-servicio) |
| `GET` | `/metrics` | Clave `metrics` | [10](#10-observabilidad-del-propio-servicio) |
| `GET` | `/docs` · `/openapi.json` | — | [12](#12-documentación-de-api-interactiva) |
