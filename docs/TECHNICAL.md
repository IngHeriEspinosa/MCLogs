# MCLog — Documentación Técnica

Referencia técnica **del sistema completo**. Para el detalle interno de cada componente:

- Backend en profundidad → [Back_MCLog/docs/TECHNICAL.md](../Back_MCLog/docs/TECHNICAL.md)
- Frontend en profundidad → [frontend_mclog/docs/TECHNICAL.md](../frontend_mclog/docs/TECHNICAL.md)
- Librería npm → [Back_MCLog/log-service-lib/README.md](../Back_MCLog/log-service-lib/README.md)
- Decisiones de arquitectura y escalabilidad → [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. Componentes y stack

| Componente | Carpeta | Stack | Puerto |
|---|---|---|---|
| API REST | [Back_MCLog/](../Back_MCLog/) | Node 20 · Express 4 · TypeScript strict · Prisma 6 · PostgreSQL 16 | 3000 |
| Dashboard | [frontend_mclog/](../frontend_mclog/) | Next.js 14 App Router · React 18 · React Query v5 · axios · Tailwind | 3001 |
| Librería Node | [Back_MCLog/log-service-lib/](../Back_MCLog/log-service-lib/) | TypeScript · sin dependencias runtime | — |
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

  @@index([timestamp]) @@index([application]) @@index([level])
  @@index([environment]) @@index([traceId])
  @@index([application, timestamp]) @@index([level, timestamp])
}

model User         { id, email @unique, passwordHash, role @default("user"), createdAt, refreshTokens[] }
model RefreshToken { id, token @unique, userId → User (onDelete: Cascade), expiresAt, createdAt, revokedAt? }
```

**Por qué esos índices.** Los compuestos `(application, timestamp)` y `(level, timestamp)` cubren los dos patrones dominantes del dashboard —"logs de la app X por fecha" y "errores recientes"— que un índice simple resolvería con un sort posterior. `traceId` está indexado porque es la vía de correlación entre sistemas.

**Por qué enums de PostgreSQL** en vez de texto: validación a nivel de motor y menor tamaño en disco e índice.

**Por qué JSONB libre** en `metadata`: cada aplicación adjunta su contexto sin migraciones. El precio es que no está indexado — si la búsqueda dentro de metadata se vuelve un requisito, hay que añadir un índice GIN.

### Migraciones

`prisma/migrations/`: `0001_init` → `0002_enums_indexes` (recrea `Log` con enums) → `0003_auth` (User/RefreshToken) → `0004_perf_indexes`.

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

#### `GET /api/logs/stats`
```json
{
  "total": 15432, "last24h": 892,
  "byLevel":       [{ "level": "error", "count": 120 }],
  "byApplication": [{ "application": "facturacion", "count": 5300 }],   // top 10
  "byEnvironment": [{ "environment": "production", "count": 14000 }]
}
```

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
| `GET /health` | — | `200 { status: "ok", timestamp }` o `503 { status: "degraded" }` |
| `GET /metrics` | `x-api-key` | Texto Prometheus |
| `GET /docs` | — | Swagger UI |

### 3.5 Formato de errores

Validación (`express-validator`) — `400`:
```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error", "path": "level" } } }
```
Auth y resto — `4xx/5xx`: `{ "error": "mensaje" }`.

---

## 4. Seguridad

### 4.1 Dos planos de autenticación

| Plano | Credencial | Endpoints | Lectura |
|---|---|---|---|
| Ingesta (M2M) | `x-api-key` | `POST /api/log`, `/api/logs/batch`, `GET /metrics` | ❌ |
| Usuarios | JWT access + refresh | `GET /api/logs*`, `DELETE /api/logs` | ✅ |

`requireApiKeyOrJwt` deja pasar la ingesta con cualquiera de los dos. **Una API key comprometida no puede leer nada.**

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

Referencia completa en su [README](../Back_MCLog/log-service-lib/README.md).

| Entry point | Exporta | Dependencias |
|---|---|---|
| `@enviromentmc/mclog` | `createMCLogClient` + tipos | **Ninguna** (fetch nativo, Node ≥18) |
| `@enviromentmc/mclog/express` | `validateLog` | `express`, `express-validator` (peers opcionales) |

Separar los entry points es lo que permite que un emisor puro no arrastre Express. Puntos de diseño: los fallos no se propagan por defecto (devuelve `boolean`, hook `onError`), `sendBatch` trocea al tamaño máximo del servidor, y la librería nunca escribe en la consola del consumidor.

```bash
npm run build      # tsc → dist/ con .d.ts y source maps
npm test           # vitest — 34 tests
npm pack           # tarball de publicación
```

---

## 9. Testing

| Suite | Comando | Cobertura |
|---|---|---|
| Backend | `cd Back_MCLog && npm test` | **53 tests** (vitest + supertest contra PostgreSQL real) |
| Librería | `cd Back_MCLog/log-service-lib && npm test` | **34 tests** (cliente con fetch inyectado + middleware con supertest) |

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
