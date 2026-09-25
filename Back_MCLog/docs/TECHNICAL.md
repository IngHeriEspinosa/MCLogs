# Back_MCLog · Documento Técnico

## Stack

Node.js 20+ (la imagen Docker usa Node 24) · Express 4 · TypeScript (strict) · Prisma 7 con `@prisma/adapter-pg` · PostgreSQL 16 · JWT (jsonwebtoken) · bcryptjs · express-validator · winston · prom-client · Swagger UI (`/docs`) · vitest + supertest.

TOTP y códigos QR están implementados en el propio proyecto (`utils/totp.ts`, `utils/qrCode.ts`), sin dependencias externas.

## Estructura

```
src/
  index.ts              Arranque: assertProductionConfig, conexión DB con reintentos,
                        ensureAdminUser (cuenta root), graceful shutdown (SIGTERM/SIGINT)
  app.ts                Composición: trust proxy → helmet → cors → cookieParser → json
                        → contexto → logging → enforceHttps → /docs → rutas → errorHandler
  config/
    env.ts              Toda la configuración desde variables de entorno + validación de producción
    logger.ts           Winston JSON (consola + logs/app.log con rotación 10MB×5)
    prisma.ts           PrismaClient singleton (adaptador pg)
    swagger.ts          Especificación OpenAPI 3 servida en /docs y /openapi.json
  middlewares/
    authApiKey.ts       requireApiKey (por scope), requireIngest y requireAuthOrReadKey
    requireAuth.ts      requireAuth (JWT Bearer/cookie con auto-refresh transparente) y
                        optionalAuth (identifica si hay sesión, sigue como anónimo si no)
    requireRole.ts      Autorización por rol de plataforma (admin); requireRoot, solo la cuenta root
    workspaceContext.ts requireWorkspace / requireWorkspaceOwner: espacio activo (X-Workspace-Id) y rol en él
    rateLimiters.ts     queryLimiter (600/15 min), ingestLimiter (2000/min) y
                        loginLimiter (10 fallos/15 min por IP) — configurables
    validateLog.ts      validateLog y validateLogBatch (metadata libre opcional)
    validateLogQuery.ts validateLogQuery, validateLogDelete, validateErrorGroups,
                        validateStatsQuery, validateApplications, validateTrace, validateLogContext
    requestContext.ts   requestId + traceId por petición
    requestLogger.ts    Línea por request con status y duración; body solo en LOG_LEVEL=debug.
                        Omite los /health correctos (el healthcheck llama cada 30 s)
    setAuthCookies.ts   Cookies httpOnly access_token / refresh_token
    enforceHttps.ts     Rechaza HTTP si FORCE_HTTPS=1 (salvo peticiones desde loopback)
    errorHandler.ts     Handler central de errores
    compressJson.ts     Comprime con brotli o gzip las respuestas de res.json de más de 1 KB (sin dependencias: zlib)
  routes/               authRoutes (/auth/*), logRoutes (/api/*), apiKeyRoutes (/api/keys),
                        alertRoutes (/api/alerts), workspaceRoutes (/api/workspaces),
                        settingsRoutes (/api/settings), snapshotRoutes (/api/snapshots y /api/share/:token)
  controllers/          logController (parseo HTTP, formatos json/csv/ndjson),
                        analysisController, streamController (SSE)
  services/             logService (Prisma), authService (tokens, rotación de refresh, login en dos pasos),
                        userService (usuarios, cuenta propia, root), twoFactorService (TOTP y
                        códigos de recuperación), apiKeyService, analysisService, passwordResetService,
                        workspaceService (espacios y miembros), settingsService (configuración en caliente),
                        snapshotService (captura, lectura con control de acceso, caducidad)
  alerts/               evaluator + notificadores (webhook, correo, Telegram)
  events/               logEvents: bus en memoria que alimenta el stream en vivo
  jobs/                 scheduler: retención, refresh tokens caducados, alertas, purga de espacios
                        borrados y de snapshots caducados
  mcp/                  server + router: herramientas MCP para asistentes de IA
  utils/                fingerprint (huella de agrupación de errores), totp (RFC 6238),
                        qrCode (codificador QR a SVG), redact (enmascarado de datos sensibles)
```

## Autenticación

### Ingesta (máquina-a-máquina)
`POST /api/log` y `POST /api/logs/batch` aceptan una **API key con scope `ingest`** o un JWT de usuario válido (así envía logs el Lab del dashboard).

La clave viaja en `x-api-key` o en `Authorization: Bearer mclog_...` (los clientes MCP solo permiten cabeceras estándar). Las claves se crean en `/api/keys` con scopes (`ingest`, `read`, `metrics`) y, opcionalmente, acotadas a ciertas aplicaciones: escribir el log de una aplicación fuera de su alcance devuelve `403` con la lista permitida. Una API key nunca recibe rol `admin`, por muchos scopes que tenga, así que jamás puede purgar logs ni administrar el servicio.

La `API_KEY` única heredada de la variable de entorno está **deprecada**, pero sigue viva para no romper emisores ya desplegados (NetSuite, scripts): se compara en tiempo constante y equivale a los scopes `ingest` y `metrics`, nunca `read`. Con su valor por defecto (`change-me`) queda desactivada.

### Usuarios (dashboard)
- `POST /auth/login` → `accessToken` (TTL `JWT_ACCESS_TTL`, default 15m) y `refreshToken` (TTL `JWT_REFRESH_TTL`, default 14d), devueltos en el body, en headers `x-access-token`/`x-refresh-token` y como cookies httpOnly. **Si la cuenta tiene 2FA**, no devuelve tokens sino `{ mfaRequired: true, mfaToken }` (ver abajo).
- Refresh **con rotación**: cada uso marca el token anterior como usado (`revokedAt`, persistido por `jti` en tabla `RefreshToken`) y emite un par nuevo. El usado sigue valiendo **30 s** (`ROTATION_GRACE_MS`): al abrir el dashboard con el access caducado salen varias peticiones a la vez con el mismo refresh, y sin margen solo la primera entraba. Logout y cambio de contraseña borran la fila, así que el margen no resucita sesiones revocadas.
- `POST /auth/refresh` acepta el token en el body **o** en la cookie `refresh_token`.
- `requireAuth` auto-refresca cuando el access token expiró, usando `x-refresh-token` o la cookie, y renueva cookies/headers en la misma respuesta.
- `POST /auth/logout` revoca el refresh y limpia cookies.
- `PATCH /auth/me/password` revoca **todas** las sesiones del usuario, incluida la actual, y limpia las cookies: hay que volver a entrar.

### Cuenta root
Al arrancar, `ensureAdminUser` crea el usuario `ADMIN_EMAIL`/`ADMIN_PASSWORD` si no existe (bcrypt cost 12) y lo marca como **root** (`isRoot`). En cada arranque:

- Si la cuenta existe pero perdió el rol `admin`, se le devuelve.
- Solo hay un root: si `ADMIN_EMAIL` cambia, la cuenta anterior pasa a ser un admin normal.

El root no se puede eliminar (`403`) ni degradar (`403`), ni por un admin ni por sí mismo. La contraseña de una cuenta existente **no** se sobrescribe con `ADMIN_PASSWORD`.

### Autenticación en dos pasos (TOTP)

Cualquier usuario puede activar un segundo factor con una app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…).

| Parámetro | Valor |
|---|---|
| Algoritmo | TOTP (RFC 6238), HMAC-SHA1, 6 dígitos, periodo 30 s |
| Tolerancia de reloj | ±1 paso (±30 s) |
| Secreto | 160 bits, Base32, emisor `MCLog`, cuenta = email |
| Anti-reutilización | `twoFactorLastStep`: un código ya aceptado no vuelve a valer. La actualización es condicional (`updateMany … where lastStep < step`), así que dos peticiones simultáneas con el mismo código no pueden ganar las dos |
| Códigos de recuperación | 8, formato `xxxxx-xxxxx`, guardados como sha256; mayúsculas y guiones se ignoran; cada uno vale una vez |

**Alta** (`/auth/me/2fa/*`):

1. `POST /setup` genera un secreto **pendiente** (sustituye a cualquier otro pendiente) y devuelve `{ data: { secret, otpauthUri, qrCode } }`; `qrCode` es un SVG en data URI. `409` si el 2FA ya está activo.
2. `POST /enable` con `{ code }` lo confirma y devuelve `{ data: { recoveryCodes } }` **una sola vez**. `400` si el código no vale; `409` si ya estaba activo o no se hizo el paso 1.

Activar el 2FA **no** cierra las sesiones ya abiertas.

**Baja**: `POST /disable` con `{ password, code }` (el código puede ser TOTP o de recuperación). Borra secreto y códigos.

**Login con 2FA:**

1. `POST /auth/login` con email y contraseña correctos → `200 { mfaRequired: true, mfaToken }`, sin cookies.
2. `POST /auth/login/2fa` con `{ mfaToken, code }` → la misma respuesta que un login normal.

El `mfaToken` es un JWT de **5 minutos**, firmado con un secreto derivado (`${JWT_ACCESS_SECRET}:mfa`) y audiencia `mclog-mfa`: `requireAuth` nunca lo acepta como access token. Errores de `/login/2fa` (`401`): `Invalid or expired sign-in attempt` (token caducado o manipulado) o `Invalid verification code`.

> No existe endpoint para que un admin resetee el 2FA de otro usuario. Si alguien pierde el dispositivo **y** los códigos, ver [USER_GUIDE.md](USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

### Eliminar la propia cuenta
`DELETE /auth/me` con `{ password, code? }` (`code` obligatorio si el 2FA está activo). Borra el usuario y, en cascada, sus refresh tokens; limpia cookies. Las API keys que creó siguen funcionando.

| Respuesta | Cuándo |
|---|---|
| `200 { ok: true }` | Cuenta eliminada |
| `400` | Contraseña incorrecta o código 2FA inválido |
| `403` | Es la cuenta root |
| `409` | Es el último admin |

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/log` | API key `ingest` o JWT | Crea un log. `403` si la aplicación queda fuera del alcance de la clave |
| POST | `/api/logs/batch` | API key `ingest` o JWT | Crea hasta `MAX_BATCH_SIZE` (500) logs en un `createMany` |
| GET | `/api/logs` | JWT o API key `read` | Lista paginada con filtros, orden y formatos |
| GET | `/api/logs/:id` | JWT o API key `read` | Log individual (`404` también si queda fuera del alcance de la clave) |
| GET | `/api/logs/:id/context` | JWT o API key `read` | Logs vecinos en el tiempo (`before`, `after`, `limit`) |
| GET | `/api/logs/stats` | JWT o API key `read` | Resumen y línea temporal (`application`, `environment`, `hours`, `from`, `to`) |
| GET | `/api/logs/applications` | JWT o API key `read` | Aplicaciones con logs en la ventana (`hours` 24–744, una semana por defecto) |
| GET | `/api/logs/stream` | JWT o API key `read` | Logs en vivo por SSE (`SSE_MAX_CONNECTIONS`). Sin rate limit |
| GET | `/api/logs/errors/groups` | JWT o API key `read` | Errores agrupados por huella, con recuento y primera/última vez |
| GET | `/api/logs/trace/:traceId` | JWT o API key `read` | Traza completa de una petición |
| DELETE | `/api/logs?before=ISO[&application=X]` | JWT dueño del espacio | Purga logs anteriores a la fecha → `{ deleted }` |
| GET · POST | `/api/keys` | JWT dueño del espacio | Lista y crea API keys con scopes y alcance por aplicación. La clave se muestra una sola vez |
| DELETE | `/api/keys/:id` | JWT dueño del espacio | Revoca una API key |
| GET · POST | `/api/alerts/channels` | JWT dueño del espacio | Canales de aviso (webhook, correo, Telegram) |
| PATCH · DELETE | `/api/alerts/channels/:id` | JWT dueño del espacio | Edita o elimina un canal |
| POST | `/api/alerts/channels/:id/test` | JWT dueño del espacio | Envía un aviso de prueba |
| GET · POST | `/api/alerts/rules` | JWT dueño del espacio | Reglas de alerta |
| PATCH · DELETE | `/api/alerts/rules/:id` | JWT dueño del espacio | Edita o elimina una regla |
| GET | `/api/alerts/events` | JWT dueño del espacio | Historial de alertas disparadas (`ruleId`, `limit`) |
| GET · POST | `/api/workspaces` | JWT | Mis espacios con mi rol; crear uno (quedo como dueño) |
| PATCH · DELETE | `/api/workspaces/:id` | JWT dueño | Renombrar; borrar (lógico) con `confirmName` |
| GET · POST · PATCH · DELETE | `/api/workspaces/:id/members[/:userId]` | JWT dueño (salir: el propio miembro) | Miembros, invitaciones y roles. Siempre queda un dueño |
| GET · PATCH · DELETE | `/api/settings[/:key]` | JWT **root** | Configuración de la plataforma en caliente |
| GET | `/api/settings/public` | JWT | Banderas que necesita el panel (Lab, MCP, crear espacios, snapshots…) |
| GET · POST | `/api/snapshots` | JWT miembro (público: dueño) | Lista (sin datos) y crea snapshots de `kind` `logs`, `errors` o `trace` (este con `filters.traceId`; `404` si no tiene logs). `403` público sin permiso, `409` tope `maxSnapshotsPerWorkspace` |
| DELETE | `/api/snapshots/:id` | JWT autor o dueño | Borra un snapshot; el enlace deja de funcionar al momento |
| GET | `/api/share/:token/preview` | — | Título, tipo, fecha y totales para la vista previa del enlace (Open Graph). Solo públicos vigentes; no cuenta visita |
| GET | `/api/share/:token` | — (miembro si es de equipo) | Lee un snapshot. `401 { requiresAuth }` si es de equipo sin sesión; `404` si no existe, caducó o no hay acceso |
| POST | `/auth/login` | — | Primer paso del login: tokens, o `mfaRequired` si hay 2FA |
| POST | `/auth/login/2fa` | — | Segundo paso: `{ mfaToken, code }` |
| POST | `/auth/refresh` · `/auth/logout` | — | Rotación y cierre de sesión |
| POST | `/auth/password/forgot` · `/auth/password/reset` | — | "Olvidé mi contraseña": enlace por correo (`503` sin SMTP o `PUBLIC_DASHBOARD_URL`) y nueva contraseña con el token |
| GET | `/auth/me` | JWT | Usuario de la sesión: `id`, `email`, `role`, `isRoot`, `twoFactorEnabled`, `createdAt` |
| PATCH | `/auth/me/password` | JWT | Cambio de contraseña propia (`newPassword` ≥ 8). Cierra **todas** las sesiones |
| DELETE | `/auth/me` | JWT | Elimina la propia cuenta (contraseña + 2FA si está activo). La cuenta root no puede |
| POST | `/auth/me/2fa/setup` · `/enable` · `/disable` | JWT | Alta y baja de la verificación en dos pasos |
| GET · POST | `/auth/users` | JWT rol admin | Lista y alta de usuarios (`password` ≥ 8; `409` si el email existe) |
| PATCH · DELETE | `/auth/users/:id` | JWT rol admin | Edita (`role` y/o `password`) o elimina un usuario. `403` sobre el root, `409` sobre el último admin o sobre uno mismo |
| POST | `/mcp` | JWT o API key `read` | Servidor MCP para asistentes de IA (`MCP_ENABLED`). `GET`/`DELETE` → `405` |
| GET | `/health` | — | Estado del servidor + DB (`503` si la DB no responde) |
| GET | `/metrics` | API key `metrics` | Métricas Prometheus |
| GET | `/docs` · `/openapi.json` | — | Swagger UI y la especificación en crudo |
| GET | `/` | — | Texto `Log Service is running!` |

### Parámetros de `GET /api/logs`

- Filtros:
  - `application`, `service`, `host`: contienen el texto, sin distinguir mayúsculas.
  - `traceId` y `fingerprint`: coincidencia exacta.
  - `level`, `environment`, `from`/`to` (ISO-8601, combinables).
  - `search`: busca a la vez en message, application, service, host y traceId.
  - **Búsqueda avanzada**, cada campo por separado: `message` (≤300), `errorName` (≤200) y `errorCode` (≤100), todos por "contiene" sin distinguir mayúsculas.
  - Todos los filtros se combinan con **Y**.
- Paginación: `page` (≥1), `pageSize` (1–200, default 20). Un valor fuera de rango es un `400`, no se recorta.
- Orden: `sort=<campo>:<asc|desc>` con campos `timestamp|application|level|host|environment` (default `timestamp:desc`).
- Export: `format=csv|ndjson` aplica los mismos filtros y devuelve una sola descarga. Aquí `pageSize` actúa como límite de filas, siempre con tope `MAX_EXPORT_ROWS` (10 000). El CSV (escapado RFC-4180) tiene columnas fijas y no incluye los campos de error; para verlos, usa NDJSON.

Respuesta JSON: `{ data, page, pageSize, total, totalPages }`.

### Contrato del log (ingesta)

**Campos obligatorios:**

- `application` (≤120)
- `level` (`debug|info|warn|error`)
- `environment` (`development|staging|production`)
- `message` (≤100 000, o el `message` del objeto `error`)

**Campos opcionales:** `service` (≤120), `host` (≤255), `timestamp` (ISO-8601), `traceId` (≤128), `spanId` (≤128), `metadata` (objeto JSON libre).

**Detalle del error:** `errorName` (≤200), `errorCode` (string o número, ≤100), `errorStack` (≤50 000) y `fingerprint` (≤64).

**Recorte (`truncateLongFields`):**

- `message`, `errorName`, `errorCode` y `errorStack` no se rechazan si superan su tope: se recortan y terminan en `…`.
- La longitud original queda en `metadata.mclogTruncated`.
- Se recortan en vez de rechazarse porque su tamaño depende de la ejecución, y un rechazo tumbaba el lote entero.
- El resto de topes se validan con `400`.

**Atajo `error`:**

- Acepta un `Error` o cualquier objeto con `name`/`message`/`code`/`stack`, y lo reparte en esos campos planos (`normalizeErrorFields`).
- Aporta el `message` si no viene ninguno.
- Los campos puestos a mano tienen prioridad.
- Un `stack` que llega como array de marcos se une con saltos de línea (NetSuite).

**Valores por defecto del servidor:**

| Campo | Default |
|---|---|
| `service` | `application` |
| `host` | hostname de la petición |
| `traceId` | uuid generado |
| `timestamp` | ahora |
| `fingerprint` | calculada para `error` y `warn` |

Las mismas reglas se publican como middleware Express en `@multicomputos-srl/mclog/express` (`validateLog`, `validateLogBatch`). Si tocas una, actualiza la otra.

**Respuestas de la ingesta:**

| Código | Significado |
|---|---|
| `201` | Log creado (`{ created }` en el lote) |
| `400` | Campo obligatorio ausente o inválido; `errors` trae el detalle por campo |
| `401` | Clave inexistente, revocada o caducada |
| `403` | Clave sin permiso `ingest`, o aplicación fuera de su alcance |
| `413` | El body supera `BODY_LIMIT` |
| `429` | Límite de ingesta superado |

## Modelo de datos e índices

Ver `prisma/schema.prisma`.

- **Log**:
  - Índices simples en `timestamp`, `application`, `level`, `environment` y `traceId`.
  - Índices compuestos `(application, timestamp)` y `(level, timestamp)` (migración `0004`).
  - Índices compuestos `(fingerprint, timestamp)` y `(environment, level, timestamp)` (migración `0006`).
- **User**: `email`, `passwordHash`, `role` (`admin`|`user`), `isRoot`, `twoFactorEnabled`, `twoFactorSecret` (VARCHAR 64), `twoFactorLastStep`, `recoveryCodes` (sha256 hex de los códigos sin usar).
- **RefreshToken** (borrado en cascada con el usuario), **PasswordResetToken** (solo el hash), **ApiKey**, **AlertChannel**, **AlertRule**, **AlertEvent**.
- **Workspace** (borrado lógico con `deletedAt`) y **WorkspaceMember** (`owner`|`member`). Logs, claves, alertas y snapshots cuelgan de un espacio y toda consulta va acotada por él.
- **AppSetting**: una fila por ajuste de la plataforma cambiado, con quién y cuándo.
- **Snapshot**: copia congelada de una vista (`filters`, `summary` y `logs` en JSONB) con `token` único (32 bytes aleatorios), `visibility` (`workspace`|`public`), `redacted`, `expiresAt?` y `viewCount`. Se borra en cascada con su espacio; el autor pasa a `null` si se borra su cuenta.

**Migraciones** (`prisma/migrations/`), en orden:

1. `0001_init`
2. `0002_enums_indexes` (recrea Log con enums)
3. `0003_auth` (User/RefreshToken)
4. `0004_perf_indexes`
5. `0005_api_keys`
6. `0006_error_fields` (errorName/errorCode/errorStack/fingerprint)
7. `0007_alerts` (canales, reglas y eventos)
8. `0008_account_security` (root y 2FA)
9. `0009_password_reset` (enlaces de "olvidé mi contraseña")
10. `0010_workspaces` (espacios y miembros; `workspaceId` en logs, claves y alertas)
11. `0011_app_settings` (configuración de la plataforma)
12. `0012_snapshots` (snapshots compartibles)
13. `0013_snapshot_kinds` (columna `kind`: snapshots de Errores y de Traza)

Se aplican con `npx prisma migrate deploy`; la imagen Docker lo hace sola en `entrypoint.sh` al arrancar. Los ficheros **deben guardarse en UTF-8**: UTF-16 rompe el motor de migraciones con "string contains embedded null".

## Variables de entorno

Ver `.env.example` comentado. Resumen de las no obvias:

| Variable | Default | Notas |
|---|---|---|
| `LOG_LEVEL` | `info` | En `debug` registra bodies redactados |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 15 min / 600 | Consultas, `/auth/*`, `/api/keys`, `/api/alerts`, `/api/snapshots`, `/api/share` y `/mcp` (no el stream) |
| `INGEST_RATE_LIMIT_WINDOW_MS` / `INGEST_RATE_LIMIT_MAX` | 60 s / 2000 | Solo ingesta; se cuenta por clave |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | 15 min / 10 | Solo intentos **fallidos**, por IP, en login, `/login/2fa`, `DELETE /auth/me` y alta/baja del 2FA |
| `MAX_BATCH_SIZE` | 500 | Tope de logs por petición batch |
| `MAX_EXPORT_ROWS` | 10000 | Tope de filas en csv/ndjson |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | 15m / 14d | El auto-refresh hace transparente el TTL corto |
| `TRUST_PROXY` | 0 | Poner 1 detrás de un proxy o balanceador (afecta rate-limit e IPs) |
| `FORCE_HTTPS` | 0 | Exige `x-forwarded-proto: https`. Las peticiones desde loopback (el HEALTHCHECK) quedan exentas |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Cuenta root, ver [Cuenta root](#cuenta-root) |
| `API_KEY` | `change-me` | Clave heredada y deprecada; con este valor queda desactivada |

**En producción** (`NODE_ENV=production`) el arranque falla si:

- `API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` o `ADMIN_PASSWORD` conservan un valor de ejemplo;
- los dos secretos JWT son iguales;
- `CORS_ORIGINS` está vacío.

Se reconocen las dos familias de marcadores: los valores de desarrollo de `.env.example` y los `CAMBIAR-...` de `deploy/.env.example`. El mensaje enumera todos los problemas a la vez.

## Seguridad

- **Borde:**
  - helmet y CORS con lista blanca y credenciales.
  - HTTPS forzable (`FORCE_HTTPS`), con loopback exento.
  - Cookies httpOnly/secure/samesite configurables.
- **Rate limiting** separado por tipo de petición: ingesta (por clave), consulta, y login (solo fallos, por IP y `/64` en IPv6). Body limit 3 MB.
- **API keys:**
  - Solo se guarda su hash.
  - La clave heredada se compara en tiempo constante (`crypto.timingSafeEqual`).
- **Contraseñas:**
  - bcrypt con cost 12; mínimo 8 caracteres para altas y cambios.
  - Cambiar la contraseña revoca todas las sesiones.
- **2FA:**
  - TOTP con anti-reutilización atómica, y códigos de recuperación hasheados y de un solo uso.
  - `mfaToken` con secreto y audiencia propios.
- **Cuentas protegidas:** el root no se borra ni se degrada; tampoco el último admin. Nadie se borra a sí mismo desde la administración de usuarios.
- **Consultas:** Prisma parametriza todas (sin SQL injection); validación estricta en el borde con express-validator.
- **Logs propios:** redactan `password`, `token`, `authorization`, etc.
- **Snapshots públicos:** se enmascaran en el servidor al crearlos (`utils/redact.ts`: correos, IPs, JWT, `Bearer`, pares `password=…`, claves con nombre de secreto y cadenas largas tipo clave), sin el nombre del espacio, con `Cache-Control: no-store` y `X-Robots-Tag: noindex`. La lectura comprueba el acceso antes de cargar los datos, y todo "no" es un `404`. Apagar `publicSnapshotsEnabled` deja de servir los ya creados.

## Tests

`npm test` (vitest + supertest, DB real en `localhost:5435` — `docker compose up -d db`).

**238 tests** en `tests/`, repartidos en diecinueve suites:

| Suite | Qué cubre |
|---|---|
| `auth` | Sesiones y seguridad |
| `accountSecurity` | 2FA, códigos de recuperación, borrar la propia cuenta, cuenta root |
| `apiKeys` | API keys con permisos y aislamiento por aplicación |
| `users` | Gestión de usuarios y salvaguardas |
| `logs` | Ingesta, consulta y búsqueda avanzada |
| `fingerprint` | Huella de agrupación |
| `errors` | Análisis de errores, trazas y contexto |
| `mcp` | Servidor MCP |
| `scheduler` | Retención y limpieza |
| `hardening` | Protecciones del borde |
| `enforceHttps` | HTTPS forzado y exención de loopback |
| `alerts` | Alertas |
| `stream` | Stream en vivo |
| `config` | Guardia de configuración de producción |
| `passwordReset` | Enlaces de "olvidé mi contraseña" |
| `workspaces` | Espacios, miembros, aislamiento de datos entre espacios |
| `settings` | Configuración de la plataforma y banderas públicas |
| `snapshots` | Crear de los tres tipos, leer con y sin sesión, vista previa, enmascarado, topes, caducidad, interruptor de públicos, borrado |
| `compression` | Brotli o gzip según `Accept-Encoding`, `q=0`, umbral de 1 KB |

Corren en serie (`--fileParallelism=false --maxWorkers=1`) porque comparten la misma base de datos.

La librería [`packages/mclog/`](../../packages/mclog/) tiene su propia suite: `cd packages/mclog && npm test` → **95 tests**.

## Build y ejecución

```bash
npm run dev      # nodemon + ts-node
npm run build    # tsc → dist/
npm start        # node dist/index.js
docker compose up -d          # db + api (aplica migraciones al arrancar)
```

La imagen de producción (`Dockerfile`) es multi-stage, sobre Node 24 alpine:

- Corre como usuario `node`.
- Aplica migraciones en `entrypoint.sh` antes de arrancar.
- Tiene un `HEALTHCHECK` contra `http://127.0.0.1:3000/health`.

`captain-definition` permite desplegarla tal cual en CapRover; ver [DEPLOYMENT.md](../../docs/DEPLOYMENT.md).
