# MCLog — Documentación Técnica

Referencia técnica **del sistema completo**. Para el detalle interno de cada componente:

- Backend en profundidad → [Back_MCLog/docs/TECHNICAL.md](../Back_MCLog/docs/TECHNICAL.md)
- Frontend en profundidad → [frontend_mclog/docs/TECHNICAL.md](../frontend_mclog/docs/TECHNICAL.md)
- Librería npm → [packages/mclog/README.md](../packages/mclog/README.md)
- Decisiones de arquitectura y escalabilidad → [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. Componentes y stack

| Componente | Carpeta | Stack | Puerto |
|---|---|---|---|
| API REST | [Back_MCLog/](../Back_MCLog/) | Node 20 · Express 4 · TypeScript strict · Prisma 6 · PostgreSQL 16 | 3000 |
| Dashboard | [frontend_mclog/](../frontend_mclog/) | Next.js 14 App Router · React 18 · React Query v5 · axios · Tailwind | 3001 |
| Librería Node | [packages/mclog/](../packages/mclog/) | TypeScript · sin dependencias runtime | — |
| Librería NetSuite | [integrations/netsuite/](../integrations/netsuite/) | SuiteScript 2.1 | — |
| Base de datos | (Docker) | PostgreSQL 16-alpine | 5435 → 5432 |

---

## 2. Modelo de datos

```prisma
model Log {
  id          Int         @id @default(autoincrement())
  timestamp   DateTime    @default(now())
  application String
  service     String?
  host        String?
  level       LogLevel                        // enum PG: debug|info|warn|error
  environment Environment                     // enum PG: development|staging|production
  message     String
  traceId     String?     @db.VarChar(128)
  spanId      String?     @db.VarChar(128)
  metadata    Json?                           // JSONB libre, sin esquema

  errorName   String?     @db.VarChar(200)    // clase de la excepción
  errorCode   String?     @db.VarChar(100)    // código de la app o del proveedor
  errorStack  String?
  fingerprint String?     @db.VarChar(64)     // huella de agrupación

  @@index([timestamp]) @@index([application]) @@index([level])
  @@index([environment]) @@index([traceId])
  @@index([application, timestamp]) @@index([level, timestamp])
  @@index([fingerprint, timestamp]) @@index([environment, level, timestamp])
}

model User         { id, email @unique, passwordHash, role @default("user"), createdAt, refreshTokens[], apiKeys[] }
model RefreshToken { id, token @unique, userId → User (onDelete: Cascade), expiresAt, createdAt, revokedAt? }
model ApiKey       { id, name, prefix @unique, keyHash @unique, scopes[], applications[],
                     createdById? → User (onDelete: SetNull), createdAt, expiresAt?, lastUsedAt?, revokedAt? }
```

**Por qué una huella.** Dos ocurrencias del mismo fallo casi nunca tienen el mismo mensaje: llevan dentro el id del pedido, un UUID o una hora. `fingerprint` es un sha256 recortado de la parte estable del error (aplicación, servicio, clase, código, primer marco del stack sin números de línea y mensaje normalizado), y es lo que permite responder "qué está fallando" en lugar de solo "qué ha pasado". La calcula el servidor para los niveles `error` y `warn`; un emisor puede enviar la suya para agrupar con otro criterio. Ver [fingerprint.ts](../Back_MCLog/src/utils/fingerprint.ts).

**Por qué solo el hash de las claves.** De una `ApiKey` se guarda `sha256` del secreto y su prefijo público. El secreto en claro se muestra una única vez, al crearla: una filtración de la base de datos no entrega ninguna clave utilizable.

**Por qué esos índices.** Los compuestos `(application, timestamp)` y `(level, timestamp)` cubren los dos patrones dominantes del dashboard —"logs de la app X por fecha" y "errores recientes"— que un índice simple resolvería con un sort posterior. `traceId` está indexado porque es la vía de correlación entre sistemas.

**Por qué enums de PostgreSQL** en vez de texto: validación a nivel de motor y menor tamaño en disco e índice.

**Por qué JSONB libre** en `metadata`: cada aplicación adjunta su contexto sin migraciones. El precio es que no está indexado — si la búsqueda dentro de metadata se vuelve un requisito, hay que añadir un índice GIN.

### Migraciones

`prisma/migrations/`: `0001_init` → `0002_enums_indexes` (recrea `Log` con enums) → `0003_auth` (User/RefreshToken) → `0004_perf_indexes` → `0005_api_keys` → `0006_error_fields`.

```bash
npx prisma migrate deploy    # aplica las pendientes
```

> Los `.sql` **deben guardarse en UTF-8**. En UTF-16 el motor falla con `string contains embedded null`. Es el error más recurrente al editarlos desde PowerShell.

---

## 3. Referencia de la API

Base: `http://localhost:3000`. Swagger interactivo en `/docs`.

### 3.1 Ingesta

#### `POST /api/log`
**Auth:** `x-api-key` o JWT · **Rate limit:** `ingestLimiter`

```jsonc
// Request
{
  "application": "facturacion",     // obligatorio, ≤120
  "level": "error",                 // obligatorio: debug|info|warn|error
  "environment": "production",      // obligatorio: development|staging|production
  "message": "Timeout en pagos",    // obligatorio, ≤100000
  "service": "orders-worker",       // opcional, ≤120  (default: application)
  "host": "node-1",                 // opcional, ≤255  (default: hostname de la petición)
  "timestamp": "2026-08-08T10:00:00Z", // opcional ISO-8601 (default: ahora)
  "traceId": "req-8842",            // opcional, ≤128  (default: UUID generado)
  "spanId": "span-1",               // opcional, ≤128
  "metadata": { "orderId": 991 }    // opcional, objeto JSON (no array)
}
```

**Respuestas:** `201` con el registro creado · `400` validación · `401` auth · `429` rate limit · `500` error interno.

#### `POST /api/logs/batch`
Body `{ "logs": [ ...entradas... ] }`. Array no vacío, máximo `MAX_BATCH_SIZE` (500). Cada entrada se valida con las mismas reglas (`logs.*.campo`).

**Respuestas:** `201 { "created": n }` · `400` si el array está vacío, supera el tope o alguna entrada es inválida.

### 3.2 Consulta

#### `GET /api/logs`
**Auth:** JWT · **Rate limit:** `queryLimiter`

| Parámetro | Tipo | Default | Notas |
|---|---|---|---|
| `page` | int ≥1 | 1 | |
| `pageSize` | int 1–200 | 20 | El validador acepta hasta 500, el controlador recorta a 200 |
| `application` / `service` / `host` | string ≤120/120/255 | — | `contains`, insensible a mayúsculas |
| `traceId` | string ≤128 | — | Coincidencia exacta |
| `level` | enum | — | |
| `environment` | enum | — | |
| `from` / `to` | ISO-8601 | — | Combinables en un único filtro sobre `timestamp` |
| `search` | string ≤300 | — | `OR` sobre message, application, service, host (parcial) y traceId (exacto) |
| `sort` | `campo:dirección` | `timestamp:desc` | Campos: `timestamp\|application\|level\|host\|environment` |
| `format` | `json\|csv\|ndjson` | `json` | |

**Respuesta JSON:**
```json
{ "data": [ /* LogEntry[] */ ], "page": 1, "pageSize": 20, "total": 1543, "totalPages": 78 }
```

`findMany` y `count` se ejecutan dentro de `prisma.$transaction` para que `total` sea coherente con la página.

**Con `format=csv|ndjson`** se ignora la paginación y se devuelven hasta `MAX_EXPORT_ROWS` (10 000) filas con los mismos filtros y orden. El CSV escapa comillas, comas y saltos de línea; el NDJSON incluye la metadata completa.

#### `GET /api/logs/:id`
`200` con el registro · `400` id no numérico · `404` no existe.

#### `GET /api/logs/errors/groups`
Errores agrupados por huella, del más frecuente al menos. Query: `hours` (default 24) o `from`/`to`, `application`, `service`, `environment`, `level` (default `error`), `limit` (1–100, default 50).

```json
{
  "data": [{
    "fingerprint": "c6caa3b09384…", "application": "facturacion", "service": "pagos",
    "level": "error", "errorName": "TypeError", "errorCode": "ETIMEDOUT",
    "sampleMessage": "Timeout cobrando el pedido 991",
    "count": 29, "firstSeen": "…", "lastSeen": "…", "lastLogId": 4821
  }],
  "from": "…", "to": "…"
}
```

Para bajar a las ocurrencias: `GET /api/logs?fingerprint=<huella>`.

#### `GET /api/logs/trace/:traceId`
Todos los logs de una traza en orden cronológico, máximo 1000. `404` si no hay ninguno.

#### `GET /api/logs/:id/context`
Lo ocurrido alrededor de un log, en su misma aplicación y servicio. Query: `before` y `after` en segundos (1–3600, default 60) y `limit` (1–200, default 50). Devuelve `{ target, from, to, data, total }`.

#### `GET /api/logs/applications`
Inventario: por aplicación, sus servicios, entornos, total, última actividad y errores de las últimas 24 h.

#### `GET /api/logs/stats`
Query opcional: `application`, `environment`, `hours` (default 24) o `from`/`to`, que acotan la serie temporal.

```json
{
  "total": 15432, "last24h": 892,
  "byLevel":       [{ "level": "error", "count": 120 }],
  "byApplication": [{ "application": "facturacion", "count": 5300 }],   // top 10
  "byEnvironment": [{ "environment": "production", "count": 14000 }],
  "timeline": [{ "bucket": "2026-09-19T18:00:00Z", "error": 12, "warn": 3, "info": 40, "debug": 2 }],
  "from": "…", "to": "…"
}
```

La serie solo incluye las horas con registros; quien la pinte debe rellenar los huecos o el eje temporal mentirá.

#### `DELETE /api/logs`
**Auth:** JWT con rol `admin`. Query: `before` (ISO-8601, **obligatorio**) y `application` (opcional). Respuesta `{ "deleted": n }`.

### 3.3 Autenticación

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /auth/login` | `{ email, password }` | `{ user, accessToken, refreshToken }` + headers `x-access-token`/`x-refresh-token` + cookies httpOnly |
| `POST /auth/refresh` | `{ refreshToken }` *(opcional: puede venir en cookie)* | Igual que login, con tokens nuevos |
| `POST /auth/logout` | `{ refreshToken }` *(opcional: cookie)* | `{ ok: true }` |

Credenciales inválidas → `401 { "error": "Invalid credentials" }`.

### 3.4 Servicio

| Endpoint | Auth | Respuesta |
|---|---|---|
| `GET /` | — | Texto plano de vida |
| `GET /health` | — | `200 { status, database, version, uptimeSeconds, timestamp }` o `503 degraded` |
| `GET /metrics` | API key con `metrics` | Texto Prometheus |
| `GET /docs` | — | Swagger UI |
| `GET /openapi.json` | — | Especificación OpenAPI en crudo, para generar clientes |
| `POST /mcp` | JWT o API key con `read` | Servidor MCP (JSON-RPC). Ver [AI_INTEGRATION.md](AI_INTEGRATION.md) |
| `GET /api/logs/stream` | JWT o API key con `read` | Stream de logs en vivo (SSE). Filtros: `level`, `application`, `environment` |

Además de las métricas por defecto del proceso, `/metrics` publica
`http_request_duration_seconds{method,route,status}` y
`mclog_logs_ingested_total{application,level}`. La ruta se etiqueta por su patrón
(`/api/logs/:id`) y no por la URL concreta, que generaría una serie temporal por cada id.

### 3.5 Administración

| Endpoint | Auth | Qué hace |
|---|---|---|
| `GET/POST /api/keys`, `DELETE /api/keys/:id` | JWT **admin** | Listar, crear y revocar API keys. El secreto se devuelve una única vez al crear |
| `/api/alerts/channels`, `/api/alerts/rules`, `/api/alerts/events` | JWT **admin** | Canales, reglas e historial de avisos. `POST /channels/:id/test` envía un aviso de prueba |
| `GET /auth/me` | JWT | Usuario de la sesión, releído de base de datos |
| `PATCH /auth/me/password` | JWT | Cambiar la propia contraseña; revoca todas las sesiones |
| `GET/POST /auth/users`, `PATCH/DELETE /auth/users/:id` | JWT **admin** | Gestión de usuarios. No se permite borrarse a uno mismo ni dejar el servicio sin admin |

### 3.6 Formato de errores

Validación (`express-validator`) — `400`:
```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error", "path": "level" } } }
```
Auth y resto — `4xx/5xx`: `{ "error": "mensaje" }`.

---

## 4. Seguridad

### 4.1 Dos planos de autenticación

| Credencial | Permisos | Alcance |
|---|---|---|
| API key `ingest` | Escribir logs | `POST /api/log`, `/api/logs/batch` |
| API key `read` | Consultar | `GET /api/logs*`, `POST /mcp` |
| API key `metrics` | Métricas | `GET /metrics` |
| JWT de usuario | Todo lo de lectura | Además `DELETE /api/logs` y administración si el rol es `admin` |

Una clave lleva los permisos que se le den al crearla, y puede acotarse además a una lista de aplicaciones. La restricción vale en los dos sentidos: no puede escribir logs de otra aplicación (`403`) ni verlos al consultar, ni en el listado, ni en las estadísticas, ni pidiendo un log por id, que responde `404` para no confirmar que existe.

**Una clave de ingesta comprometida no puede leer nada.** Es la razón de separar los permisos en lugar de tener una clave que lo haga todo.

Las claves se aceptan en `x-api-key` y también en `Authorization: Bearer mclog_…`, porque los clientes MCP solo permiten cabeceras estándar. Un `Bearer` que no tenga forma de clave MCLog se trata como JWT.

**Ninguna API key recibe rol `admin`.** Aunque tenga todos los permisos, las operaciones de administración le quedan fuera.

La clave única de la variable `API_KEY` sigue funcionando con permisos `ingest` y `metrics`, por compatibilidad con los emisores ya desplegados. Está **deprecada**: no se puede rotar sin cortar el servicio ni acotar por aplicación.

### 4.2 Ciclo de vida de los tokens

```
login  →  accessToken (JWT_ACCESS_TTL, 15m)   firmado con JWT_ACCESS_SECRET
       →  refreshToken (JWT_REFRESH_TTL, 14d) firmado con JWT_REFRESH_SECRET
          + fila en RefreshToken con su jti y expiresAt

refresh → verifica firma + fila viva (no revocada, no expirada)
        → BORRA la fila anterior  ← rotación: un refresh token es de un solo uso
        → emite un par nuevo

logout  → elimina la fila por jti + limpia cookies
```

`requireAuth` implementa **auto-refresh**: ante un `TokenExpiredError` intenta refrescar con el header `x-refresh-token` o la cookie, y si lo logra sirve la petición renovando cookies y headers en la misma respuesta.

> **Nota operativa:** la cookie `access_token` se emite con `maxAge` de 7 días aunque el JWT dentro caduque a los 15 minutos. Es intencional: la cookie sigue viajando para que el auto-refresh pueda actuar. La autoridad es siempre la expiración del JWT, no la de la cookie.

### 4.3 Defensas del borde

| Capa | Configuración |
|---|---|
| `helmet` | Defaults |
| CORS | Lista blanca `CORS_ORIGINS`, `credentials: true`. Sin `Origin` → permitido (curl, health checks) |
| Body limit | `BODY_LIMIT` (3 MB) |
| Rate limit consulta | `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` (600 / 15 min) — aplica a `/auth/*` y `/api/logs*` |
| Rate limit ingesta | `INGEST_RATE_LIMIT_MAX` / `..._WINDOW_MS` (2000 / 60 s) — independiente del anterior |
| API key | `crypto.timingSafeEqual` (tiempo constante) |
| Cookies | `httpOnly` siempre; `secure` forzado en producción; `sameSite` y `domain` configurables |
| HTTPS | `FORCE_HTTPS=1` rechaza peticiones no cifradas con `400` |

### 4.4 Guardia de producción

`assertProductionConfig()` aborta el arranque con `NODE_ENV=production` si:

- `API_KEY` sigue siendo `change-me` o `dev-key`
- `JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET` conservan el valor de desarrollo
- `CORS_ORIGINS` está vacío

Es deliberado: **es preferible no arrancar a arrancar inseguro**.

---

## 5. Configuración

Todas las variables se leen en [env.ts](../Back_MCLog/src/config/env.ts). Los booleanos aceptan `1` o `true`.

### Backend (`Back_MCLog/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | — | Cadena de conexión PostgreSQL. **Obligatoria** |
| `NODE_ENV` | `development` | `production` activa la guardia de seguridad y cookies secure |
| `PORT` | `3000` | |
| `API_KEY` | `change-me` | Clave de ingesta |
| `BODY_LIMIT` | `3mb` | |
| `LOG_LEVEL` | `info` | `debug` registra también bodies redactados |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 900000 / 600 | Consultas y `/auth` |
| `INGEST_RATE_LIMIT_WINDOW_MS` / `INGEST_RATE_LIMIT_MAX` | 60000 / 2000 | Solo ingesta |
| `MAX_BATCH_SIZE` | `500` | Tope de entradas por lote |
| `MAX_EXPORT_ROWS` | `10000` | Tope de filas en CSV/NDJSON |
| `CORS_ORIGINS` | — | Lista separada por comas |
| `TRUST_PROXY` | `0` | `1` detrás de load balancer (afecta IP real y rate limiting) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | valores dev | **Deben ser distintos entre sí** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `14d` | Formato `<n><ms\|s\|m\|h\|d>` |
| `FORCE_HTTPS` | `0` | |
| `COOKIE_SECURE` | `0` | Forzado a `1` si `NODE_ENV=production` |
| `COOKIE_SAMESITE` | `lax` | `lax\|strict\|none` |
| `COOKIE_DOMAIN` | — | Para compartir cookie entre subdominios |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Si están, se crea el admin al arrancar |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | 900000 / 10 | Solo `POST /auth/login`; cuenta únicamente los intentos fallidos |
| `RETENTION_DAYS` | `0` | Días de logs a conservar. `0` no purga nunca y la tabla crece sin límite |
| `SCHEDULER_ENABLED` | `1` | Mantenimiento periódico. Con varias instancias, dejarlo activo en una sola |
| `MCP_ENABLED` | `1` | Expone el servidor MCP en `/mcp` |
| `SSE_MAX_CONNECTIONS` | `50` | Conexiones simultáneas al stream en vivo, **por instancia** |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / 587 / `0` | Servidor de correo para el canal de alertas por email |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | Credenciales y remitente del correo |
| `PUBLIC_DASHBOARD_URL` | — | URL del dashboard, para enlaces en notificaciones |

### Frontend (`frontend_mclog/.env.local`)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL pública de la API (`http://localhost:3000` en local) |

> `CORS_ORIGINS` del backend debe incluir **exactamente** el origen del dashboard, y en producción `COOKIE_SECURE=1`.

---

## 6. Flujo de una petición

### Ingesta
```
helmet → CORS → cookieParser → express.json(3mb) → requestContext (requestId/traceId)
      → requestLogger → enforceHttps → ingestLimiter → requireApiKeyOrJwt
      → validateLog → logController.log → logService.createLog → 201
```

### Consulta
```
… → queryLimiter → requireAuth (con auto-refresh) → [requireRole('admin') si es DELETE]
  → validateLogQuery → logController.getLogs → logService.listLogs ($transaction) → 200
```

Errores no capturados → `errorHandler` central.

---

## 7. Frontend

### Estructura
```
src/
  app/
    layout.tsx              Server component: metadata + <Providers>
    providers.tsx           QueryClientProvider (staleTime 15s, retry 1)
    page.tsx                Dashboard (client, en <Suspense> por useSearchParams)
    (auth)/login/page.tsx   Login
  common/api/
    client.ts               axios withCredentials; interceptor 401 → /auth/refresh → retry
    download.ts             Export CSV/NDJSON con los filtros activos
    logout.ts
  hooks/
    useAuth.ts              useLogin, useLogout, useLogs, useLogStats + tipos
    useDebounce.ts          350 ms
  components/
    atoms/                  PrimaryButton, Skeleton, LevelBadge
    molecules/              Card, DownloadActions, StatsCards
    templates/              DashboardLayout, AuthLayout
  config/api.ts             API_BASE desde NEXT_PUBLIC_API_URL
```

### Decisiones

- **El front nunca toca tokens.** Viven en cookies httpOnly gestionadas por el backend; axios va con `withCredentials`. No hay middleware de rutas: la fuente de verdad de la sesión es el backend, y el guard es el interceptor de 401.
- **React Query v5** con `placeholderData: keepPreviousData` — al paginar o refiltrar la tabla anterior se mantiene atenuada en vez de parpadear a vacío. Stats con `refetchInterval` de 60 s.
- **Filtros en la URL**, omitiendo los valores por defecto para mantenerla limpia. Copiar el enlace reproduce la vista.
- **Debounce de 350 ms** en búsqueda y aplicación.
- **Todo client-side**: los datos son privados y dinámicos, el SSR no aportaría nada.

---

## 8. Librería `@enviromentmc/mclog`

Referencia completa en su [README](../packages/mclog/README.md).

| Entry point | Exporta | Dependencias |
|---|---|---|
| `@enviromentmc/mclog` | `createMCLogClient` + tipos | **Ninguna** (fetch nativo, Node ≥18) |
| `@enviromentmc/mclog/express` | `validateLog` | `express`, `express-validator` (peers opcionales) |

Separar los entry points es lo que permite que un emisor puro no arrastre Express. Puntos de diseño: los fallos no se propagan por defecto (devuelve `boolean`, hook `onError`), `sendBatch` trocea al tamaño máximo del servidor, y la librería nunca escribe en la consola del consumidor.

```bash
npm run build      # tsc → dist/ con .d.ts y source maps
npm test           # vitest — 83 tests
npm pack           # tarball de publicación
```

---

## 9. Testing

| Suite | Comando | Cobertura |
|---|---|---|
| Backend | `cd Back_MCLog && npm test` | **150 tests** (vitest + supertest contra PostgreSQL real) |
| Librería | `cd packages/mclog && npm test` | **83 tests** (cliente con fetch inyectado + middleware con supertest) |
| Cliente NetSuite | `node integrations/netsuite/test_mclog_client.js` | **32 comprobaciones** (arnés que simula `define()` y los módulos `N/`, sin dependencias) |

El backend requiere la base levantada:
```bash
cd Back_MCLog && docker compose up -d db
npm test
```

Los tests del backend usan `DATABASE_URL` apuntando a `localhost:5435` y corren en serie (`--fileParallelism=false`) porque comparten la base.

---

## 10. Despliegue

### Docker Compose

```bash
cd Back_MCLog
docker compose up -d          # db + api; la api aplica migraciones al arrancar
```

El servicio `api` ejecuta `npx prisma migrate deploy && node dist/index.js`. El `Dockerfile` es multi-stage: compila con `npm ci` + `tsc`, poda las devDependencies y copia solo `dist`, `node_modules`, `prisma` y los manifests a la imagen final.

### Checklist de producción

1. `NODE_ENV=production`
2. `API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` aleatorios y distintos (`openssl rand -hex 32`)
3. `ADMIN_PASSWORD` fuerte
4. `CORS_ORIGINS` con la URL exacta del dashboard
5. `FORCE_HTTPS=1`, `COOKIE_SECURE=1`, `TRUST_PROXY=1` si hay proxy
6. Un cron de purga configurado — la tabla crece sin límite
7. Backups del volumen `pgdata`

El arranque fallará si 1, 2 o 4 no están bien: es la guardia, no un error.

### Escalado

El proceso es **stateless** (todo el estado vive en PostgreSQL), así que escala horizontalmente detrás de un balanceador sin cambios. El orden recomendado de evolución está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).
