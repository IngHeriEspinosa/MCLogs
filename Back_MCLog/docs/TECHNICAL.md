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
    authApiKey.ts       requireApiKey (tiempo constante) y requireApiKeyOrJwt (ingesta)
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
  routes/               authRoutes (/auth/*), logRoutes (/api/*)
  controllers/          logController: parseo HTTP, formatos json/csv/ndjson
  services/             logService (Prisma), authService (tokens, rotación de refresh)
```

## Autenticación

### Ingesta (máquina-a-máquina)
`POST /api/log` y `POST /api/logs/batch` aceptan **`x-api-key: <API_KEY>`** (comparación en tiempo constante) **o** un JWT válido. La API key no da acceso a lectura.

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
| POST | `/api/log` | API key o JWT | Crea un log |
| POST | `/api/logs/batch` | API key o JWT | Crea hasta `MAX_BATCH_SIZE` (500) logs en un `createMany` |
| GET | `/api/logs` | JWT | Lista paginada con filtros, orden y formatos |
| GET | `/api/logs/stats` | JWT | total, últimas 24h, por nivel, top-10 apps, por entorno |
| GET | `/api/logs/:id` | JWT | Log individual |
| DELETE | `/api/logs?before=ISO[&application=X]` | JWT rol admin | Purga logs anteriores a la fecha |
| POST | `/auth/login` `/auth/refresh` `/auth/logout` | — | Ciclo de sesión |
| GET | `/health` | — | Estado del servidor + DB |
| GET | `/metrics` | API key | Métricas Prometheus |
| GET | `/docs` | — | Swagger UI |

### Parámetros de `GET /api/logs`

- Filtros: `application`, `service`, `host` (contains, case-insensitive), `traceId` (exacto), `level`, `environment`, `from`/`to` (ISO-8601, combinables), `search` (busca en message, application, service, host y traceId).
- Paginación: `page` (≥1), `pageSize` (1–200, default 20).
- Orden: `sort=<campo>:<asc|desc>` con campos `timestamp|application|level|host|environment` (default `timestamp:desc`).
- Export: `format=csv|ndjson` ignora la paginación y devuelve hasta `MAX_EXPORT_ROWS` (10 000) filas con los mismos filtros. CSV con escapado RFC-4180.

Respuesta JSON: `{ data, page, pageSize, total, totalPages }`.

### Contrato del log (ingesta)

Obligatorios: `application` (≤120), `level` (`debug|info|warn|error`), `environment` (`development|staging|production`), `message` (≤100 000).
Opcionales: `service`, `host`, `timestamp` (ISO-8601), `traceId`, `spanId`, `metadata` (objeto JSON libre).
Defaults del servidor: `service`=application, `host`=hostname de la petición, `traceId`=generado (uuid), `timestamp`=ahora.

## Modelo de datos e índices

Ver `prisma/schema.prisma`. Índices simples en `timestamp`, `application`, `level`, `environment`, `traceId` y compuestos `(application, timestamp)` y `(level, timestamp)` (migración `0004_perf_indexes`).

Migraciones (`prisma/migrations/`): `0001_init` → `0002_enums_indexes` (recrea Log con enums) → `0003_auth` (User/RefreshToken) → `0004_perf_indexes`. Aplicar con `npx prisma migrate deploy`. **Deben guardarse en UTF-8** (UTF-16 rompe el motor de migraciones con "string contains embedded null").

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

**En producción** (`NODE_ENV=production`) el arranque falla si `API_KEY`, `JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET` conservan valores por defecto o si `CORS_ORIGINS` está vacío.

## Seguridad

- helmet, CORS con lista blanca y credenciales, HTTPS forzable (`FORCE_HTTPS`), cookies httpOnly/secure/samesite configurables.
- Rate limiting separado ingesta/consulta; body limit 3 MB.
- API key comparada en tiempo constante (`crypto.timingSafeEqual`).
- Prisma parametriza todas las consultas (sin SQL injection); validación estricta en el borde con express-validator.
- Logs propios redactan `password`, `token`, `authorization`, etc.

## Tests

`npm test` (vitest + supertest, DB real en `localhost:5434` — `docker compose up -d db`).
**53 tests** en `tests/`: credenciales inválidas, auto-refresh con rotación y cookies, revocación al logout, API key en /metrics, body >3 MB, ingesta JWT y API key, metadata opcional, level inválido, batch, paginación, from+to combinados, search, sort por campo, 401 sin auth y con solo API key en lectura, CSV, stats y purga admin.

Corren en serie (`--fileParallelism=false --maxWorkers=1`) porque comparten la misma base de datos.

La librería [`log-service-lib/`](../log-service-lib/) tiene su propia suite: `cd log-service-lib && npm test` → **34 tests**.

## Build y ejecución

```bash
npm run dev      # nodemon + ts-node
npm run build    # tsc → dist/
npm start        # node dist/index.js
docker compose up -d          # db + api (aplica migraciones al arrancar)
```
