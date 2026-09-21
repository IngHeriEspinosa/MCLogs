# Back_MCLog · Documento Técnico

## Stack

Node.js 20 · Express 4 · TypeScript (strict) · Prisma 6 · PostgreSQL 16 · JWT (jsonwebtoken) · bcryptjs · express-validator · winston · prom-client · Swagger UI (`/docs`) · vitest + supertest.

## Estructura

```
src/
  index.ts              Arranque: assertProductionConfig, conexión DB con reintentos,
                        ensureAdminUser, graceful shutdown (SIGTERM/SIGINT)
  app.ts                Composición: helmet → cors → json → contexto → logging → rutas
  config/
    env.ts              Toda la configuración desde variables de entorno + validación de producción
    logger.ts           Winston JSON (consola + logs/app.log con rotación 10MB×5)
    prisma.ts           PrismaClient singleton
    swagger.ts          Especificación OpenAPI 3 servida en /docs
  middlewares/
    authApiKey.ts       requireApiKey (por scope), requireIngest y requireAuthOrReadKey
    requireAuth.ts      JWT Bearer/cookie con auto-refresh transparente
    requireRole.ts      Autorización por rol (admin para purga)
    rateLimiters.ts     queryLimiter (600/15min) e ingestLimiter (2000/min) — configurables
    validateLog.ts      validateLog y validateLogBatch (metadata libre opcional)
    validateLogQuery.ts validateLogQuery y validateLogDelete
    requestContext.ts   requestId + traceId por petición
    requestLogger.ts    Línea por request con status y duración; body solo en LOG_LEVEL=debug
    setAuthCookies.ts   Cookies httpOnly access_token / refresh_token
    enforceHttps.ts     Rechaza HTTP si FORCE_HTTPS=1
    errorHandler.ts     Handler central de errores
  routes/               authRoutes (/auth/*), logRoutes (/api/*),
                        apiKeyRoutes (/api/keys), alertRoutes (/api/alerts)
  controllers/          logController (parseo HTTP, formatos json/csv/ndjson),
                        analysisController, streamController (SSE)
  services/             logService (Prisma), authService (tokens, rotación de refresh),
                        userService, apiKeyService, analysisService
  alerts/               evaluator + notificadores (webhook, correo, Telegram)
  events/               logEvents: bus en memoria que alimenta el stream en vivo
  jobs/                 scheduler: purga por retención (RETENTION_DAYS)
  mcp/                  server + router: herramientas MCP para asistentes de IA
  utils/                fingerprint: huella de agrupación de errores
```

## Autenticación

### Ingesta (máquina-a-máquina)
`POST /api/log` y `POST /api/logs/batch` aceptan una **API key con scope `ingest`** o un JWT válido.

La clave viaja en `x-api-key` o en `Authorization: Bearer mclog_...` (los clientes MCP solo permiten cabeceras estándar). Las claves se crean en `/api/keys` con scopes (`ingest`, `read`, `metrics`) y, opcionalmente, acotadas a ciertas aplicaciones: escribir el log de una aplicación fuera de su alcance devuelve `403` con la lista permitida. Una API key nunca recibe rol `admin`, por muchos scopes que tenga, así que jamás puede purgar logs ni administrar el servicio.

La `API_KEY` única heredada de la variable de entorno sigue viva para no romper emisores ya desplegados (NetSuite, scripts): se compara en tiempo constante y equivale a los scopes `ingest` y `metrics`, nunca `read`.

### Usuarios (dashboard)
- `POST /auth/login` → `accessToken` (TTL `JWT_ACCESS_TTL`, default 15m) y `refreshToken` (TTL `JWT_REFRESH_TTL`, default 14d), devueltos en el body, en headers `x-access-token`/`x-refresh-token` y como cookies httpOnly.
- Refresh **con rotación**: cada uso invalida el token anterior (persistido por `jti` en tabla `RefreshToken`).
- `POST /auth/refresh` acepta el token en el body **o** en la cookie `refresh_token`.
- `requireAuth` auto-refresca cuando el access token expiró, usando `x-refresh-token` o la cookie, y renueva cookies/headers en la misma respuesta.
- `POST /auth/logout` revoca el refresh y limpia cookies.
- Al arrancar, si no existe, se crea el usuario `ADMIN_EMAIL`/`ADMIN_PASSWORD` con rol `admin` (bcrypt cost 12).

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/log` | API key `ingest` o JWT | Crea un log |
| POST | `/api/logs/batch` | API key `ingest` o JWT | Crea hasta `MAX_BATCH_SIZE` (500) logs en un `createMany` |
| GET | `/api/logs` | JWT o API key `read` | Lista paginada con filtros, orden y formatos |
| GET | `/api/logs/:id` | JWT o API key `read` | Log individual |
| GET | `/api/logs/:id/context` | JWT o API key `read` | Logs vecinos en el tiempo, para ver qué pasaba alrededor |
| GET | `/api/logs/stats` | JWT o API key `read` | total, últimas 24h, por nivel, top-10 apps, por entorno |
| GET | `/api/logs/applications` | JWT o API key `read` | Aplicaciones distintas vistas |
| GET | `/api/logs/stream` | JWT o API key `read` | Logs en vivo por SSE (`SSE_MAX_CONNECTIONS`) |
| GET | `/api/logs/errors/groups` | JWT o API key `read` | Errores agrupados por huella, con recuento y primera/última vez |
| GET | `/api/logs/trace/:traceId` | JWT o API key `read` | Traza completa de una petición |
| DELETE | `/api/logs?before=ISO[&application=X]` | JWT rol admin | Purga logs anteriores a la fecha |
| GET · POST | `/api/keys` | JWT rol admin | Lista y crea API keys con scopes y alcance por aplicación |
| DELETE | `/api/keys/:id` | JWT rol admin | Revoca una API key |
| GET · POST | `/api/alerts/channels` | JWT | Canales de aviso (webhook, correo, Telegram) |
| PATCH · DELETE | `/api/alerts/channels/:id` | JWT | Edita o elimina un canal |
| POST | `/api/alerts/channels/:id/test` | JWT | Envía un aviso de prueba |
| GET · POST | `/api/alerts/rules` | JWT | Reglas de alerta |
| PATCH · DELETE | `/api/alerts/rules/:id` | JWT | Edita o elimina una regla |
| GET | `/api/alerts/events` | JWT | Historial de alertas disparadas |
| POST | `/auth/login` `/auth/refresh` `/auth/logout` | — | Ciclo de sesión |
| GET | `/auth/me` | JWT | Usuario de la sesión |
| PATCH | `/auth/me/password` | JWT | Cambio de contraseña propia (cierra las demás sesiones) |
| GET · POST | `/auth/users` | JWT rol admin | Lista y alta de usuarios |
| PATCH · DELETE | `/auth/users/:id` | JWT rol admin | Edita o elimina un usuario |
| POST | `/mcp` | JWT o API key `read` | Servidor MCP para asistentes de IA (`MCP_ENABLED`) |
| GET | `/health` | — | Estado del servidor + DB |
| GET | `/metrics` | API key `metrics` | Métricas Prometheus |
| GET | `/docs` | — | Swagger UI |

### Parámetros de `GET /api/logs`

- Filtros: `application`, `service`, `host` (contains, case-insensitive), `traceId` (exacto), `level`, `environment`, `from`/`to` (ISO-8601, combinables), `search` (busca en message, application, service, host y traceId).
- Paginación: `page` (≥1), `pageSize` (1–200, default 20).
- Orden: `sort=<campo>:<asc|desc>` con campos `timestamp|application|level|host|environment` (default `timestamp:desc`).
- Export: `format=csv|ndjson` ignora la paginación y devuelve hasta `MAX_EXPORT_ROWS` (10 000) filas con los mismos filtros. CSV con escapado RFC-4180.

Respuesta JSON: `{ data, page, pageSize, total, totalPages }`.

### Contrato del log (ingesta)

Obligatorios: `application` (≤120), `level` (`debug|info|warn|error`), `environment` (`development|staging|production`), `message` (≤100 000, o el `message` del objeto `error`).
Opcionales: `service` (≤120), `host` (≤255), `timestamp` (ISO-8601), `traceId` (≤128), `spanId` (≤128), `metadata` (objeto JSON libre).
Detalle del error: `errorName` (≤200), `errorCode` (string o número, ≤100), `errorStack` (≤50 000) y `fingerprint` (≤64).
Atajo `error`: un `Error` o cualquier objeto con `name`/`message`/`code`/`stack` se reparte en esos campos planos (`normalizeErrorFields`) y aporta el `message` si no viene ninguno; los campos puestos a mano tienen prioridad. El `stack` como array de marcos se une con saltos de línea (NetSuite).
Defaults del servidor: `service`=application, `host`=hostname de la petición, `traceId`=generado (uuid), `timestamp`=ahora, `fingerprint`=calculada para `error` y `warn`.

Las mismas reglas se publican como middleware Express en `@multicomputos-srl/mclog/express` (`validateLog`, `validateLogBatch`). Si tocas una, actualiza la otra.

## Modelo de datos e índices

Ver `prisma/schema.prisma`. Índices simples en `timestamp`, `application`, `level`, `environment`, `traceId` y compuestos `(application, timestamp)` y `(level, timestamp)` (migración `0004_perf_indexes`).

Migraciones (`prisma/migrations/`): `0001_init` → `0002_enums_indexes` (recrea Log con enums) → `0003_auth` (User/RefreshToken) → `0004_perf_indexes` → `0005_api_keys` → `0006_error_fields` (errorName/errorCode/errorStack/fingerprint) → `0007_alerts` (canales, reglas y eventos). Aplicar con `npx prisma migrate deploy`. **Deben guardarse en UTF-8** (UTF-16 rompe el motor de migraciones con "string contains embedded null").

## Variables de entorno

Ver `.env.example` comentado. Resumen de las no obvias:

| Variable | Default | Notas |
|---|---|---|
| `LOG_LEVEL` | `info` | En `debug` registra bodies redactados |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 15 min / 600 | Consultas y /auth |
| `INGEST_RATE_LIMIT_WINDOW_MS` / `INGEST_RATE_LIMIT_MAX` | 60 s / 2000 | Solo ingesta |
| `MAX_BATCH_SIZE` | 500 | Tope de logs por petición batch |
| `MAX_EXPORT_ROWS` | 10000 | Tope de filas en csv/ndjson |
| `JWT_ACCESS_TTL` | 15m | El auto-refresh hace transparente el TTL corto |
| `TRUST_PROXY` | 0 | Poner 1 detrás de load balancer (afecta rate-limit e IPs) |

**En producción** (`NODE_ENV=production`) el arranque falla si `API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` o `ADMIN_PASSWORD` conservan un valor de ejemplo, si los dos secretos JWT son iguales, o si `CORS_ORIGINS` está vacío. Se reconocen las dos familias de marcadores: los valores de desarrollo de `.env.example` y los `CAMBIAR-...` de `deploy/.env.example`. El mensaje enumera todos los problemas a la vez.

## Seguridad

- helmet, CORS con lista blanca y credenciales, HTTPS forzable (`FORCE_HTTPS`), cookies httpOnly/secure/samesite configurables.
- Rate limiting separado ingesta/consulta; body limit 3 MB.
- API key comparada en tiempo constante (`crypto.timingSafeEqual`).
- Prisma parametriza todas las consultas (sin SQL injection); validación estricta en el borde con express-validator.
- Logs propios redactan `password`, `token`, `authorization`, etc.

## Tests

`npm test` (vitest + supertest, DB real en `localhost:5435` — `docker compose up -d db`).
**150 tests** en `tests/`, repartidos en doce suites: sesiones y seguridad (`auth`), API keys con permisos y aislamiento por aplicación (`apiKeys`), gestión de usuarios y salvaguardas (`users`), ingesta y consulta (`logs`), huella de agrupación (`fingerprint`), análisis de errores, trazas y contexto (`errors`), servidor MCP (`mcp`), retención y limpieza (`scheduler`), protecciones del borde (`hardening`), alertas (`alerts`), stream en vivo (`stream`) y guardia de configuración de producción (`config`).

Corren en serie (`--fileParallelism=false --maxWorkers=1`) porque comparten la misma base de datos.

La librería [`packages/mclog/`](../../packages/mclog/) tiene su propia suite: `cd packages/mclog && npm test` → **83 tests**.

## Build y ejecución

```bash
npm run dev      # nodemon + ts-node
npm run build    # tsc → dist/
npm start        # node dist/index.js
docker compose up -d          # db + api (aplica migraciones al arrancar)
```
