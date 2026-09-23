# MCLog — Documentación Técnica

Referencia técnica **del sistema completo**. Para el detalle interno de cada componente:

- Backend en profundidad → [Back_MCLog/docs/TECHNICAL.md](../Back_MCLog/docs/TECHNICAL.md)
- Frontend en profundidad → [frontend_mclog/docs/TECHNICAL.md](../frontend_mclog/docs/TECHNICAL.md)
- Librería npm → [packages/mclog/README.md](../packages/mclog/README.md)
- Cliente NetSuite → [integrations/netsuite/README.md](../integrations/netsuite/README.md)
- Decisiones de arquitectura y escalabilidad → [ARCHITECTURE.md](ARCHITECTURE.md)
- Despliegue → [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 1. Componentes y stack

| Componente | Carpeta | Stack | Puerto |
|---|---|---|---|
| API REST | [Back_MCLog/](../Back_MCLog/) | Node 20+ (imagen: Node 24) · Express 4 · TypeScript strict · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL 16 | 3000 |
| Dashboard | [frontend_mclog/](../frontend_mclog/) | Next.js 14 App Router (`output: standalone`) · React 18 · React Query v5 · axios · Tailwind | 3001 |
| Sitio público | [site/](../site/) | Next.js (export estático) · GitHub Pages | — |
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

model User         { id, email @unique, passwordHash, role @default("user"), createdAt,
                     isRoot @default(false),                       // cuenta de arranque (ADMIN_EMAIL)
                     twoFactorEnabled @default(false), twoFactorSecret? @db.VarChar(64),
                     twoFactorLastStep?,                           // último paso TOTP aceptado (anti-replay)
                     recoveryCodes String[],                       // sha256 de los códigos sin usar
                     refreshTokens[], apiKeys[] }
model RefreshToken { id, token @unique, userId → User (onDelete: Cascade), expiresAt, createdAt, revokedAt? }
model ApiKey       { id, name, prefix @unique, keyHash @unique, scopes[], applications[],
                     createdById? → User (onDelete: SetNull), createdAt, expiresAt?, lastUsedAt?, revokedAt? }

model AlertChannel { id, name, type (webhook|email|telegram), config Json, enabled, createdAt, rules[] }
model AlertRule    { id, name, type (threshold|new_error_group), enabled, application?, service?,
                     environment?, level @default(error), threshold, windowMinutes, cooldownMinutes,
                     lastTriggeredAt?, channels[], events[] }
model AlertEvent   { id, ruleId → AlertRule (onDelete: Cascade), triggeredAt, count, sampleLogIds[], deliveries Json }
```

**Por qué una huella.** Dos ocurrencias del mismo fallo casi nunca tienen el mismo mensaje: llevan dentro el id del pedido, un UUID o una hora. `fingerprint` es un sha256 recortado de la parte estable del error (aplicación, servicio, clase, código, primer marco del stack sin números de línea y mensaje normalizado), y es lo que permite responder "qué está fallando" en lugar de solo "qué ha pasado". La calcula el servidor para los niveles `error` y `warn`; un emisor puede enviar la suya para agrupar con otro criterio. Ver [fingerprint.ts](../Back_MCLog/src/utils/fingerprint.ts).

**Por qué solo el hash de las claves.** De una `ApiKey` se guarda `sha256` del secreto y su prefijo público. El secreto en claro se muestra una única vez, al crearla: una filtración de la base de datos no entrega ninguna clave utilizable. Con los códigos de recuperación del 2FA se hace lo mismo.

**Por qué `twoFactorLastStep`.** Un código TOTP es válido durante su ventana de 30 s (±1 paso de tolerancia). Guardar el último paso aceptado impide reutilizar un código ya usado, por ejemplo uno visto por encima del hombro.

**Por qué esos índices.** Los compuestos `(application, timestamp)` y `(level, timestamp)` cubren los dos patrones dominantes del dashboard —"logs de la app X por fecha" y "errores recientes"— que un índice simple resolvería con un sort posterior. `traceId` está indexado porque es la vía de correlación entre sistemas.

**Por qué enums de PostgreSQL** en vez de texto: validación a nivel de motor y menor tamaño en disco e índice.

**Por qué JSONB libre** en `metadata`: cada aplicación adjunta su contexto sin migraciones. El precio es que no está indexado — si la búsqueda dentro de metadata se vuelve un requisito, hay que añadir un índice GIN.

### Migraciones

`prisma/migrations/`, en orden:

1. `0001_init`
2. `0002_enums_indexes` (recrea `Log` con enums)
3. `0003_auth` (User/RefreshToken)
4. `0004_perf_indexes`
5. `0005_api_keys`
6. `0006_error_fields`
7. `0007_alerts` (canales, reglas, eventos)
8. `0008_account_security` (cuenta root y 2FA)

```bash
npx prisma migrate deploy    # aplica las pendientes
```

La imagen Docker del backend lo ejecuta sola al arrancar (`entrypoint.sh`).

> Los `.sql` **deben guardarse en UTF-8**. En UTF-16 el motor falla con `string contains embedded null`. Es el error más recurrente al editarlos desde PowerShell.

---

## 3. Referencia de la API

Base: `http://localhost:3000`. Swagger interactivo en `/docs`.

### 3.1 Ingesta

#### `POST /api/log`
**Auth:** API key con permiso `ingest` (`x-api-key` o `Authorization: Bearer mclog_…`) o JWT de usuario · **Rate limit:** `ingestLimiter`

```jsonc
// Request
{
  "application": "facturacion",     // obligatorio, ≤120
  "level": "error",                 // obligatorio: debug|info|warn|error
  "environment": "production",      // obligatorio: development|staging|production
  "message": "Timeout en pagos",    // obligatorio, ≤100000 (si pasa, se recorta)
  "service": "orders-worker",       // opcional, ≤120  (default: application)
  "host": "node-1",                 // opcional, ≤255  (default: hostname de la petición)
  "timestamp": "2026-08-08T10:00:00Z", // opcional ISO-8601 (default: ahora)
  "traceId": "req-8842",            // opcional, ≤128  (default: UUID generado)
  "spanId": "span-1",               // opcional, ≤128
  "metadata": { "orderId": 991 },   // opcional, objeto JSON (no array)
  "error": { "name": "…", "message": "…", "code": "…", "stack": "…" }, // opcional: atajo que rellena los 4 siguientes
  "errorName": "TimeoutError",      // opcional, ≤200 (si pasa, se recorta)
  "errorCode": "ETIMEDOUT",         // opcional, string o número, ≤100 (si pasa, se recorta)
  "errorStack": "TimeoutError: …",  // opcional, ≤50000 (si pasa, se recorta)
  "fingerprint": "c6caa3…"          // opcional, ≤64 (default: calculada para error y warn)
}
```

**Respuestas:** `201` con el registro creado · `400` validación · `401` credencial inválida, revocada o caducada · `403` clave sin `ingest` o aplicación fuera de su alcance (`allowedApplications` en el body) · `413` body mayor que `BODY_LIMIT` · `429` rate limit · `500` error interno.

#### `POST /api/logs/batch`
Body `{ "logs": [ ...entradas... ] }`. Array no vacío, máximo `MAX_BATCH_SIZE` (500). Cada entrada se valida con las mismas reglas (`logs.*.campo`).

**Respuestas:** `201 { "created": n }` · `400` si el array está vacío, supera el tope o alguna entrada es inválida.

### 3.2 Consulta

#### `GET /api/logs`
**Auth:** JWT o API key con permiso `read` · **Rate limit:** `queryLimiter`

| Parámetro | Tipo | Default | Notas |
|---|---|---|---|
| `page` | int ≥1 | 1 | |
| `pageSize` | int 1–200 | 20 | Fuera de rango → `400` |
| `application` / `service` / `host` | string ≤120/120/255 | — | `contains`, insensible a mayúsculas |
| `traceId` | string ≤128 | — | Coincidencia exacta |
| `fingerprint` | string ≤64 | — | Coincidencia exacta: las ocurrencias de un mismo fallo |
| `level` | enum | — | |
| `environment` | enum | — | |
| `from` / `to` | ISO-8601 | — | Combinables en un único filtro sobre `timestamp` |
| `search` | string ≤300 | — | `OR` sobre message, application, service, host (parcial) y traceId (exacto) |
| `message` | string ≤300 | — | **Búsqueda avanzada**: el mensaje contiene el texto (insensible a mayúsculas) |
| `errorName` | string ≤200 | — | **Búsqueda avanzada**: la clase del error contiene el texto |
| `errorCode` | string ≤100 | — | **Búsqueda avanzada**: el código contiene el texto |
| `sort` | `campo:dirección` | `timestamp:desc` | Campos: `timestamp\|application\|level\|host\|environment` |
| `format` | `json\|csv\|ndjson` | `json` | |

Todos los filtros se combinan con **Y**. La búsqueda libre (`search`) y la avanzada (un campo por parámetro) pueden usarse a la vez. Una clave acotada a ciertas aplicaciones solo ve las suyas.

**Respuesta JSON:**
```json
{ "data": [ /* LogEntry[] */ ], "page": 1, "pageSize": 20, "total": 1543, "totalPages": 78 }
```

`findMany` y `count` se ejecutan dentro de `prisma.$transaction` para que `total` sea coherente con la página.

**Con `format=csv|ndjson`** se devuelve una descarga con los mismos filtros y orden, sin paginar: `pageSize` actúa como límite de filas, siempre con tope `MAX_EXPORT_ROWS` (10 000). El CSV escapa comillas, comas y saltos de línea y tiene columnas fijas, sin metadata ni campos de error; el NDJSON incluye el registro completo.

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
Inventario: por aplicación, sus servicios, entornos, logs en la ventana, última actividad y errores de las últimas 24 h. Query opcional: `hours` (24–744, default 168 = una semana). Solo aparecen las aplicaciones con logs en la ventana; sin ella la consulta recorría la tabla entera en cada llamada. Devuelve `{ data, from, to }`.

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
| `POST /auth/login` | `{ email, password }` | `{ user, accessToken, refreshToken }` + headers `x-access-token`/`x-refresh-token` + cookies httpOnly. **Con 2FA activo:** `{ mfaRequired: true, mfaToken }`, sin cookies |
| `POST /auth/login/2fa` | `{ mfaToken, code }` | Igual que un login completo |
| `POST /auth/refresh` | `{ refreshToken }` *(opcional: puede venir en cookie)* | Igual que login, con tokens nuevos |
| `POST /auth/logout` | `{ refreshToken }` *(opcional: cookie)* | `{ ok: true }` |

Errores:

- Credenciales inválidas → `401 { "error": "Invalid credentials" }`.
- En `/login/2fa`:
  - `401 { "error": "Invalid verification code" }` si el código no vale.
  - `401 { "error": "Invalid or expired sign-in attempt" }` si el `mfaToken` caducó (5 min) o no es válido.
- Tras 10 fallos en 15 min desde una IP → `429`.

**Un login desde un script** (curl, CI) tiene que contemplar las dos respuestas:

```bash
curl -s -X POST "$MCLOG/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"yo@empresa.com","password":"…"}'
# → {"accessToken": …}               sesión abierta
# → {"mfaRequired":true,"mfaToken":…} falta el segundo paso:
curl -s -X POST "$MCLOG/auth/login/2fa" -H "Content-Type: application/json" \
  -d '{"mfaToken":"<mfaToken>","code":"123456"}'
```

Para automatizaciones es mejor una **API key** con el permiso justo: no caduca a los 15 minutos ni depende del 2FA de una persona.

#### Cuenta propia y segundo factor

| Endpoint | Body | Respuesta |
|---|---|---|
| `GET /auth/me` | — | `{ data: { id, email, role, isRoot, twoFactorEnabled, createdAt } }` |
| `PATCH /auth/me/password` | `{ currentPassword, newPassword }` (≥8, distinta) | `{ ok, message }`; revoca **todas** las sesiones y limpia cookies |
| `POST /auth/me/2fa/setup` | — | `{ data: { secret, otpauthUri, qrCode } }` (`qrCode` = SVG en data URI). `409` si ya está activo |
| `POST /auth/me/2fa/enable` | `{ code }` | `{ data: { recoveryCodes: [8] } }`, **solo esta vez**. `400` código incorrecto · `409` ya activo o sin `/setup` previo |
| `POST /auth/me/2fa/disable` | `{ password, code }` | `{ ok: true }`. `code` puede ser TOTP o de recuperación |
| `DELETE /auth/me` | `{ password, code? }` | `{ ok: true }`. `400` contraseña o código · `403` cuenta root · `409` último admin |

TOTP según RFC 6238:

- SHA1, 6 dígitos, periodo de 30 s, ±1 paso de tolerancia.
- Emisor `MCLog`.
- Un código aceptado no vuelve a valer.

Los códigos de recuperación tienen formato `xxxxx-xxxxx`, valen una vez cada uno y se comparan sin distinguir mayúsculas ni guiones.

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
`http_request_duration_seconds{method,route,status}`,
`mclog_logs_ingested_total{application,level}` y `mclog_sse_connections` (conexiones
abiertas al stream en vivo). La ruta se etiqueta por su patrón
(`/api/logs/:id`) y no por la URL concreta, que generaría una serie temporal por cada id.

### 3.5 Administración

| Endpoint | Auth | Qué hace |
|---|---|---|
| `GET/POST /api/keys`, `DELETE /api/keys/:id` | JWT **admin** | Listar, crear y revocar API keys. El secreto se devuelve una única vez al crear |
| `/api/alerts/channels`, `/api/alerts/rules`, `/api/alerts/events` | JWT **admin** | Canales, reglas e historial de avisos. `POST /channels/:id/test` envía un aviso de prueba |
| `GET/POST /auth/users`, `PATCH/DELETE /auth/users/:id` | JWT **admin** | Gestión de usuarios (alta con contraseña ≥8; `PATCH` cambia `role` y/o `password` y revoca sus sesiones). No se permite borrarse a uno mismo, borrar o degradar la cuenta root (`403`) ni dejar el servicio sin admin (`409`). No hay endpoint para quitar el 2FA de otro usuario |

La cuenta propia y el 2FA están en [3.3](#33-autenticación).

**Cuenta root.** Es la de `ADMIN_EMAIL`, y `ensureAdminUser` la marca en cada arranque:

- La crea con `ADMIN_PASSWORD` si no existe. Si ya existe, no toca su contraseña.
- Le devuelve el rol `admin` si lo perdió.
- Si `ADMIN_EMAIL` cambia, retira la marca de root a la cuenta anterior.

### 3.6 Formato de errores

Validación (`express-validator`) — `400`:
```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error", "path": "level" } } }
```
En `POST /auth/login`, `/auth/login/2fa` y `/auth/refresh` la validación responde `{ "errors": { … } }`, sin `status`.

Auth y resto — `4xx/5xx`: `{ "error": "mensaje" }`.

---

## 4. Seguridad

### 4.1 Dos planos de autenticación

| Credencial | Permisos | Alcance |
|---|---|---|
| API key `ingest` | Escribir logs | `POST /api/log`, `/api/logs/batch` |
| API key `read` | Consultar | `GET /api/logs*`, `POST /mcp` |
| API key `metrics` | Métricas | `GET /metrics` |
| JWT de usuario | Lectura e ingesta | Además `DELETE /api/logs` y administración si el rol es `admin` |

Una clave lleva los permisos que se le den al crearla, y puede acotarse además a una lista de aplicaciones. La restricción vale en los dos sentidos: no puede escribir logs de otra aplicación (`403`) ni verlos al consultar, ni en el listado, ni en las estadísticas, ni pidiendo un log por id, que responde `404` para no confirmar que existe.

**Una clave de ingesta comprometida no puede leer nada.** Es la razón de separar los permisos en lugar de tener una clave que lo haga todo.

Las claves se aceptan en `x-api-key` y también en `Authorization: Bearer mclog_…`, porque los clientes MCP solo permiten cabeceras estándar. Un `Bearer` que no tenga forma de clave MCLog se trata como JWT.

**Ninguna API key recibe rol `admin`.** Aunque tenga todos los permisos, las operaciones de administración le quedan fuera.

La clave única de la variable `API_KEY` sigue funcionando con permisos `ingest` y `metrics`, por compatibilidad con los emisores ya desplegados. Está **deprecada**: no se puede rotar sin cortar el servicio ni acotar por aplicación.

### 4.2 Ciclo de vida de los tokens

```
login (sin 2FA)  →  accessToken (JWT_ACCESS_TTL, 15m)   firmado con JWT_ACCESS_SECRET
                 →  refreshToken (JWT_REFRESH_TTL, 14d) firmado con JWT_REFRESH_SECRET
                    + fila en RefreshToken con su jti y expiresAt

login (con 2FA)  →  mfaToken (5 min) firmado con "JWT_ACCESS_SECRET:mfa", audiencia mclog-mfa
                    (requireAuth no lo acepta como access token)
login/2fa        →  verifica mfaToken + código TOTP o de recuperación → el mismo par de arriba

refresh → verifica firma + fila existente y no expirada
        → si la fila ya está marcada como usada hace más de 30 s → 401
        → marca la fila como usada (revokedAt)  ← rotación con margen de 30 s
        → emite un par nuevo

logout  → elimina la fila por jti + limpia cookies
```

El **margen de 30 segundos** existe porque, al abrir el dashboard con el access token caducado, varias peticiones salen a la vez con el mismo refresh token; sin margen solo la primera rotaba y el resto recibía `401`, lo que cerraba la sesión. Logout y cambio de contraseña **borran** la fila en lugar de marcarla, así que el margen no resucita sesiones revocadas.

`requireAuth` implementa **auto-refresh**: ante un `TokenExpiredError` intenta refrescar con el header `x-refresh-token` o la cookie, y si lo logra sirve la petición renovando cookies y headers en la misma respuesta.

> **Nota operativa:** la cookie `access_token` se emite con `maxAge` de 7 días aunque el JWT dentro caduque a los 15 minutos. Es intencional: la cookie sigue viajando para que el auto-refresh pueda actuar. La autoridad es siempre la expiración del JWT, no la de la cookie.

### 4.3 Defensas del borde

| Capa | Configuración |
|---|---|
| `helmet` | Defaults |
| CORS | Lista blanca `CORS_ORIGINS`, `credentials: true`. Sin `Origin` → permitido (curl, health checks) |
| Body limit | `BODY_LIMIT` (3 MB) |
| Rate limit consulta | `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` (600 / 15 min). Aplica a `/auth/*`, `/api/logs*` (salvo el stream), `/api/keys`, `/api/alerts` y `/mcp`. Cuenta por clave si la hay, si no por IP |
| Rate limit ingesta | `INGEST_RATE_LIMIT_MAX` / `..._WINDOW_MS` (2000 / 60 s), independiente del anterior. Cuenta por clave: una integración ruidosa no gasta la cuota de las demás |
| Rate limit login | `LOGIN_RATE_LIMIT_MAX` / `..._WINDOW_MS` (10 / 15 min), por IP (IPv6 por `/64`). Solo cuenta los **fallos**. Cubre `POST /auth/login`, `/auth/login/2fa`, `DELETE /auth/me` y `/auth/me/2fa/enable` y `/disable` |
| API key | Solo se guarda su sha256; la clave heredada se compara con `crypto.timingSafeEqual` (tiempo constante) |
| Cookies | `httpOnly` siempre; `secure` forzado en producción; `sameSite` y `domain` configurables |
| HTTPS | `FORCE_HTTPS=1` rechaza peticiones no cifradas con `400`. Las que vienen de loopback (el HEALTHCHECK del contenedor) quedan exentas |

### 4.4 Guardia de producción

`assertProductionConfig()` aborta el arranque con `NODE_ENV=production` si:

- `API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` o `ADMIN_PASSWORD` conservan un valor de ejemplo:
  - los que empiezan por `cambiar`, `change-me` o `changeme`;
  - o los literales `dev-key`, `dev-access-secret`, `dev-refresh-secret`, `admin`, `password`, `secret`.
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` son iguales.
- `CORS_ORIGINS` está vacío.

El mensaje ("Configuración insegura para producción") enumera todos los problemas a la vez.

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
| `API_KEY` | `change-me` | Clave heredada (`ingest` + `metrics`), **deprecada**. Con `change-me` queda desactivada |
| `BODY_LIMIT` | `3mb` | |
| `LOG_LEVEL` | `info` | `debug` registra también bodies redactados |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 900000 / 600 | Consultas, `/auth`, administración y `/mcp` |
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
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Cuenta root: se crea al arrancar si no existe, y no se puede borrar ni degradar |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | 900000 / 10 | Login, segundo paso del 2FA, alta/baja del 2FA y borrar la propia cuenta; cuenta únicamente los intentos fallidos |
| `RETENTION_DAYS` | `0` | Días de logs a conservar. `0` no purga nunca y la tabla crece sin límite |
| `SCHEDULER_ENABLED` | `1` | Mantenimiento periódico. Con varias instancias, dejarlo activo en una sola |
| `MCP_ENABLED` | `1` | Expone el servidor MCP en `/mcp` |
| `SSE_MAX_CONNECTIONS` | `50` | Conexiones simultáneas al stream en vivo, **por instancia** |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / 587 / `0` | Servidor de correo para el canal de alertas por email |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — / — / `MCLog <no-reply@localhost>` | Credenciales y remitente del correo |
| `PUBLIC_DASHBOARD_URL` | — | URL del dashboard, para enlaces en notificaciones |

### Frontend (`frontend_mclog/.env.local`)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL pública de la API (`http://localhost:3000` en local). Se incrusta **al compilar**. Vacía = mismo origen (detrás de Caddy) |
| `PORT` | Puerto del servidor standalone en la imagen Docker (default 3001; Railway lo inyecta) |

> `CORS_ORIGINS` del backend debe incluir **exactamente** el origen del dashboard, y en producción `COOKIE_SECURE=1`. Con dashboard y API en dominios distintos, ver [DEPLOYMENT.md](DEPLOYMENT.md#opción-b--caprover--railway).

---

## 6. Flujo de una petición

### Ingesta
```
helmet → CORS → cookieParser → express.json(3mb) → requestContext (requestId/traceId)
      → requestLogger → enforceHttps → ingestLimiter → requireIngest (API key ingest o JWT)
      → validateLog → logController.log → logService.createLog → 201
```

### Consulta
```
… → queryLimiter → requireAuthOrReadKey (JWT con auto-refresh o API key read)
  → validateLogQuery → logController.getLogs → logService.listLogs ($transaction) → 200
```

La purga (`DELETE /api/logs`) usa `requireAuth` + `requireRole('admin')`: una API key nunca llega.

Errores no capturados → `errorHandler` central.

---

## 7. Frontend

Detalle completo en [frontend_mclog/docs/TECHNICAL.md](../frontend_mclog/docs/TECHNICAL.md).

### Estructura
```
src/
  app/                      Rutas: portada (/), logs, records, errors, reports, trace/[traceId],
                            lab, settings/* (api-keys, users, alerts, password = Mi cuenta), login
    lab/                    Escenarios de prueba del Lab y su envío
  common/
    api/                    axios withCredentials (401 → /auth/refresh → retry), export, errores
    i18n/                   Diccionarios es/en tipados, formato con Intl, proveedor
    theme/                  Claro/oscuro/sistema con cookie y script anti-destello
    time/                   Rangos relativos/absolutos en la URL, serie horaria
    reports/                Recogida de datos, generadores (Markdown, brief IA, JSON), enmascarado
  hooks/                    Datos (React Query), filtros en la URL, paneles flotantes, preferencias
  components/
    atoms/                  Button, Input, Field, Checkbox, Switch, Segmented, Icon, LevelBadge…
    molecules/              Select, Menu, Dialog, DateRangePicker, ActivityChart, StatTile, MarkdownView…
    organisms/              Sidebar, Topbar, LogFilterBar, LogOverview, LogTable, LogInspector,
                            AdvancedLogSearch, LabScenarioCard, LabComposer, TwoFactorCard, DeleteAccountCard
    templates/              DashboardLayout, AuthLayout
  config/api.ts             API_BASE desde NEXT_PUBLIC_API_URL
```

(`lab/` vive dentro de `common/`.)

### Decisiones

- **El front nunca toca tokens.** Viven en cookies httpOnly gestionadas por el backend; axios va con `withCredentials`. No hay middleware de rutas: la fuente de verdad de la sesión es el backend. Los guards son el interceptor de 401 y `DashboardLayout`, que manda a `/login?next=<ruta>` si `/auth/me` falla. El `mfaToken` del login en dos pasos solo vive en memoria del formulario.
- **Registros y búsqueda avanzada**: la misma tabla que Logs, sin resumen, con seis filtros por campo (`message`, `service`, `host`, `traceId`, `errorName`, `errorCode`) en la URL y el detalle del log como modal a pantalla completa con navegación ←/→.
- **Lab** (admin): escenarios que envían logs reales a aplicaciones `lab-*` con la sesión del usuario, en lotes de 100 o de uno en uno para el stream, con un `AbortController` por escenario y purga de todo lo `lab-*`.
- **Sin librerías de UI ni de gráficos**: componentes, iconos y gráficos SVG propios, accesibles por teclado.
- **Tokens de color en variables CSS** con un valor por tema; Tailwind los expone por rol (`surface`, `ink`, `brand`…). Paleta de niveles validada para daltonismo sobre cada superficie.
- **Español e inglés** con diccionarios tipados (una traducción que falta no compila) e idioma y tema en cookies que el servidor lee, para que la primera pintura ya salga bien.
- **Hasta 4K**: el tamaño raíz crece con el ancho y las vistas de datos usan hasta 3840 px; el detalle del log pasa a columna lateral desde 1920 px.
- **React Query v5** con `placeholderData: keepPreviousData`: al paginar o refiltrar, lo anterior se mantiene atenuado en vez de parpadear a vacío.
- **Filtros en la URL**, incluido el rango (`range=24h` o `from`/`to`), omitiendo los valores por defecto. Copiar el enlace reproduce la vista.
- **Reportes en el navegador**: Markdown para personas y briefs para agentes de IA con los datos de los logs aislados en `<mclog_data>` y enmascarado de datos sensibles.
- **Todo client-side** salvo el layout raíz, que lee las cookies de idioma y tema: los datos son privados y dinámicos, el SSR no aportaría nada.

---

## 8. Librería `@multicomputos-srl/mclog`

Referencia completa en su [README](../packages/mclog/README.md).

| Entry point | Exporta | Dependencias |
|---|---|---|
| `@multicomputos-srl/mclog` | `createMCLogClient`, `extractError` + tipos | **Ninguna** (fetch nativo, Node ≥18) |
| `@multicomputos-srl/mclog/express` | `validateLog`, `validateLogBatch`, `normalizeErrorFields`, `truncateLongFields` | `express`, `express-validator` (peers opcionales) |

Separar los entry points es lo que permite que un emisor puro no arrastre Express. Puntos de diseño:

- Los fallos no se propagan por defecto: cada método devuelve `boolean`, y está el hook `onError`.
- Los fallos transitorios se reintentan (red, timeout, `408`, `429`, `5xx`) con backoff exponencial, jitter y `Retry-After`.
- `sendBatch` trocea por entradas (`maxBatchSize`) y por bytes (`maxBatchBytes`), por debajo de los topes del servidor.
- La librería nunca escribe en la consola del consumidor.

```bash
npm run build      # tsc → dist/ con .d.ts y source maps
npm test           # vitest — 95 tests
npm pack           # tarball de publicación
```

---

## 9. Testing

| Suite | Comando | Cobertura |
|---|---|---|
| Backend | `cd Back_MCLog && npm test` | **175 tests en 14 suites** (vitest + supertest contra PostgreSQL real) |
| Dashboard | `cd frontend_mclog && npm test` | **33 tests en 10 suites** (generación de reportes, enmascarado, Markdown y preferencias; runner nativo de Node 24, sin dependencias) |
| Librería | `cd packages/mclog && npm test` | **95 tests** (cliente con fetch inyectado + middleware con supertest) |
| Cliente NetSuite | `node integrations/netsuite/test_mclog_client.js` | **40 comprobaciones** (arnés que simula `define()` y los módulos `N/`, sin dependencias) |

El backend requiere la base levantada:
```bash
cd Back_MCLog && docker compose up -d db
npm test
```

Los tests del backend usan `DATABASE_URL` apuntando a `localhost:5435` y corren en serie (`--fileParallelism=false`) porque comparten la base.

---

## 10. Despliegue

Guía completa en [DEPLOYMENT.md](DEPLOYMENT.md). Hay dos topologías soportadas:

| Opción | Dónde corre cada pieza | Cuándo |
|---|---|---|
| **A — VPS con Docker Compose** | Todo en un host: Caddy (HTTPS) + dashboard + API + PostgreSQL + backups, bajo **un solo dominio** | La más simple de operar |
| **B — CapRover + Railway** | API y PostgreSQL como apps separadas en CapRover; dashboard en Railway, en **otro dominio** | Si ya tienes esos servicios; exige CORS y cookies entre dominios |

### Imágenes

- **API** (`Back_MCLog/Dockerfile`), sobre Node 24 alpine:
  - Multi-stage: compila con `npm ci` + `tsc`, poda las devDependencies (conserva el CLI de Prisma) y copia solo `dist`, `node_modules`, `prisma` y los manifests.
  - Corre como usuario `node`.
  - `entrypoint.sh` aplica `prisma migrate deploy` antes de arrancar; CapRover no permite sobrescribir el comando.
  - `HEALTHCHECK` contra `127.0.0.1:3000/health`.
- **Dashboard** (`frontend_mclog/Dockerfile`), sobre Node 20 alpine:
  - Build `standalone`.
  - `NEXT_PUBLIC_API_URL` como build arg.
  - Escucha en `PORT` (3001 por defecto).

### Checklist de producción

1. `NODE_ENV=production`
2. `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y `API_KEY` aleatorios y distintos (`openssl rand -hex 32`)
3. `ADMIN_EMAIL` real y `ADMIN_PASSWORD` fuerte (será la cuenta root)
4. `CORS_ORIGINS` con la URL exacta del dashboard
5. `FORCE_HTTPS=1`, `COOKIE_SECURE=1`, `TRUST_PROXY=1` si hay proxy
6. `RETENTION_DAYS` distinto de 0: el propio servicio purga cada hora; con 0 la tabla crece sin límite
7. Backups de la base de datos
8. Tras el primer login: cambiar la contraseña del root y activar su verificación en dos pasos

El arranque fallará si 1, 2, 3 o 4 no están bien: es la guardia, no un error.

### Escalado

Sesiones, claves y logs viven en PostgreSQL, así que la API escala horizontalmente detrás de un balanceador, con dos salvedades:

- **Planificador**: el que purga y evalúa las alertas debe correr en **una sola** instancia (`SCHEDULER_ENABLED=1` solo en una).
- **Stream en vivo**: su bus de eventos y el tope `SSE_MAX_CONNECTIONS` son **por instancia**, así que cada cliente del stream ve los logs que entraron por su réplica.

El orden recomendado de evolución está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).
