# MCLog — Arquitectura

## Visión general

MCLog centraliza los logs de múltiples aplicaciones en una base PostgreSQL, expuestos por una API REST y visualizados en un dashboard web.

```
┌─────────────────────────┐
│  Aplicaciones emisoras  │
│  · NetSuite SuiteScript │──┐
│  · Servicios Node.js    │  │  POST /api/log · /api/logs/batch
│  · Scripts Python       │  │  (x-api-key)
│  · Cualquier app HTTP   │──┤
└─────────────────────────┘  │
                             ▼
                   ┌───────────────────┐        ┌──────────────┐
                   │    Back_MCLog     │        │  PostgreSQL   │
                   │  Express + Prisma │◄──────►│  tabla Log +  │
                   │  (puerto 3000)    │        │  User/Refresh │
                   └───────────────────┘        └──────────────┘
                             ▲
                             │  GET /api/logs, /stats (JWT + cookies httpOnly)
                   ┌───────────────────┐
                   │  frontend_mclog   │
                   │  Next.js 14 SPA   │
                   │  (puerto 3001)    │
                   └───────────────────┘
```

## Autenticación: dos planos separados

| Plano | Quién | Mecanismo | Endpoints |
|---|---|---|---|
| **Ingesta** (máquina-a-máquina) | NetSuite, scripts, servicios | Header `x-api-key` (comparación en tiempo constante). Alternativamente JWT. | `POST /api/log`, `POST /api/logs/batch` |
| **Consulta / administración** (humanos) | Usuarios del dashboard | JWT access (15 min) + refresh (14 días) con rotación, en cookies httpOnly o headers | `GET /api/logs*`, `DELETE /api/logs`, `/auth/*` |

Decisiones clave:
- El **refresh token se rota** en cada uso y se persiste por `jti` en la tabla `RefreshToken`; logout lo revoca.
- `requireAuth` reintenta automáticamente con el refresh token cuando el access token expiró (auto-refresh transparente, renovando cookies y headers `x-access-token`).
- La API key jamás da acceso de lectura: un emisor comprometido no puede leer los logs de otros.
- `/metrics` (Prometheus) también se protege con API key.

## Modelo de datos

```prisma
model Log {
  id          Int         @id @default(autoincrement())
  timestamp   DateTime    @default(now())     // indexado
  application String                           // indexado (+ compuesto con timestamp)
  service     String?                          // subcomponente (p. ej. scriptId de NetSuite)
  host        String?
  level       LogLevel                         // debug|info|warn|error (enum PG, indexado)
  environment Environment                      // development|staging|production (enum PG)
  message     String
  traceId     String?     @db.VarChar(128)     // correlación entre servicios (indexado)
  spanId      String?     @db.VarChar(128)
  metadata    Json?                            // contexto libre por aplicación
}
```

Índices: `timestamp`, `application`, `level`, `environment`, `traceId` y compuestos `(application, timestamp)` y `(level, timestamp)` — cubren los patrones dominantes del dashboard: "logs de la app X ordenados por fecha" y "errores recientes".

`metadata` es JSONB **libre**: cada aplicación adjunta su propio contexto sin migraciones. La validación exige solo `application`, `level`, `environment`, `message`.

## Flujo de una petición de ingesta

1. `helmet` → CORS → `express.json` (límite 3 MB) → `requestContext` (requestId/traceId) → `requestLogger`.
2. `ingestLimiter` (2000 req/min por defecto, ventana de 60 s — separado del límite de consultas para que un dashboard intensivo no bloquee la ingesta ni viceversa).
3. `requireApiKeyOrJwt` → validación (`express-validator`) → `createLog`/`createLogsBatch` (Prisma `createMany` para lotes) → 201.

## Rendimiento y escalabilidad

**Hoy (una instancia):**
- Lotes de hasta 500 logs por petición (`/api/logs/batch`, un solo `INSERT` vía `createMany`).
- Exportaciones CSV/NDJSON limitadas a `MAX_EXPORT_ROWS` (10 000) para no agotar memoria.
- Paginación obligatoria (máx. 200 por página) con `findMany`+`count` en una transacción.
- El proceso es **stateless** (el estado vive en PostgreSQL): se puede escalar horizontalmente detrás de un load balancer sin cambios.

**Camino de crecimiento (en orden de necesidad):**
1. **Retención**: programar `DELETE /api/logs?before=<fecha>` (cron/scheduler) — la tabla Log crece sin límite si no se purga.
2. **Particionamiento por rango de `timestamp`** (PostgreSQL native partitioning) cuando la tabla supere decenas de millones de filas: las purgas pasan a ser `DROP PARTITION`.
3. **Réplicas de lectura** para el dashboard si la carga de consultas compite con la ingesta.
4. **Cola intermedia** (Redis/SQS) solo si la ingesta supera lo que PostgreSQL absorbe directo; no añadirla antes: es complejidad sin beneficio a baja escala.
5. **Búsqueda full-text** (`tsvector` o índice GIN sobre `metadata`) si `ILIKE` deja de ser suficiente.

## Observabilidad del propio servicio

- `GET /health` — verifica servidor + conexión a DB (`SELECT 1`); pensado para load balancers y uptime checks.
- `GET /metrics` — métricas Prometheus (CPU, memoria, event loop) protegidas por API key.
- Logs propios: winston JSON a consola y `logs/app.log` (rotación 10 MB × 5). Una línea por request con `requestId`, `traceId`, status y duración; el body solo se registra en `LOG_LEVEL=debug` con secretos redactados.
- `assertProductionConfig()` impide arrancar en producción con secretos por defecto o CORS abierto.

## Frontend

- Next.js 14 App Router; toda la página del dashboard es client-side (los datos son privados y dinámicos, SSR no aporta).
- React Query gestiona cache/reintentos (`placeholderData: keepPreviousData` evita parpadeos al paginar; stats con `refetchInterval` de 60 s).
- El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/login` si falla — el guard de sesión es el propio backend.
- Los filtros viven en la URL (`?level=error&application=...`): compartir el enlace reproduce la vista exacta.
- Búsqueda y filtro de aplicación con debounce de 350 ms para no disparar una consulta por tecla.

## Estructura del backend

```
src/
  index.ts          arranque: valida config, conecta DB con reintentos, crea admin, graceful shutdown
  app.ts            composición de middlewares y rutas
  config/           env (+validación de producción), logger, prisma, swagger
  middlewares/      auth (apikey/jwt/rol), validación, rate limits, contexto, logging, errores
  routes/           authRoutes, logRoutes
  controllers/      logController (HTTP puro: parseo, formatos csv/ndjson)
  services/         logService, authService (lógica de negocio y acceso a datos)
prisma/             schema + migrations (0001–0004)
tests/              vitest + supertest contra DB real
```
