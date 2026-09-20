# MCLog — Arquitectura

## Visión general

MCLog centraliza los logs de múltiples aplicaciones en una base PostgreSQL, expuestos por una API REST, un servidor MCP para asistentes de IA y un dashboard web.

```
┌─────────────────────────┐
│  Aplicaciones emisoras  │
│  · NetSuite SuiteScript │──┐
│  · Servicios Node.js    │  │  POST /api/log · /api/logs/batch
│  · Scripts Python       │  │  (clave con permiso "ingest")
│  · Cualquier app HTTP   │──┤
└─────────────────────────┘  │
                             ▼
                   ┌───────────────────┐        ┌──────────────────────┐
                   │    Back_MCLog     │        │      PostgreSQL      │
                   │  Express + Prisma │◄──────►│  Log · User · ApiKey │
                   │   (puerto 3000)   │        │  Alert{Channel,Rule, │
                   └───┬───────────┬───┘        │        Event}        │
                       │           │            └──────────────────────┘
       GET /api/logs*  │           │  POST /mcp (clave "read")
       GET /api/logs/  │           │
            stream     │           ▼
                       │   ┌────────────────────┐
                       │   │  Asistentes de IA  │
                       │   │  Claude Code,      │
                       │   │  Cursor, Desktop   │
                       │   └────────────────────┘
                       ▼
             ┌───────────────────┐        ┌─────────────────────────┐
             │  frontend_mclog   │        │  Canales de aviso       │
             │  Next.js 14 SPA   │        │  webhook · correo ·     │
             │   (puerto 3001)   │        │  Telegram               │
             └───────────────────┘        └─────────────────────────┘
                                                      ▲
                                          planificador cada minuto
```

En producción, un proxy Caddy sirve el dashboard y la API bajo el mismo dominio y es lo único que publica puertos. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

## Autenticación: credenciales con alcance

| Credencial | Permite | Usada por |
|---|---|---|
| API key `ingest` | Escribir logs | Aplicaciones emisoras |
| API key `read` | Consultar logs y usar MCP | Asistentes de IA, integraciones |
| API key `metrics` | Leer `/metrics` | Prometheus |
| JWT de usuario | Consultar; con rol `admin`, también administrar | Personas, desde el dashboard |

Decisiones clave:

- **Los permisos se separan porque el daño de una filtración lo define el permiso, no la clave.** Una clave de ingesta comprometida escribe logs basura; no expone nada de lo almacenado.
- **Una clave puede acotarse a una lista de aplicaciones**, y la restricción se aplica en escritura y en lectura, incluido el detalle por id, que responde `404` en lugar de `403` para no confirmar que el registro existe.
- **Ninguna API key recibe rol `admin`.** Purgar logs o administrar el servicio exige una sesión de persona.
- De cada clave **solo se guarda el sha256**. El secreto viaja en claro una única vez, al crearla.
- Las claves se aceptan en `x-api-key` y en `Authorization: Bearer`, porque los clientes MCP solo permiten cabeceras estándar. Un `Bearer` sin forma de clave MCLog se trata como JWT.
- El **refresh token se rota** en cada uso y se persiste por `jti`; logout lo revoca, y cambiar contraseña o rol revoca todos los del usuario.
- `requireAuth` reintenta con el refresh token cuando el access token expiró, renovando cookies en la misma respuesta.

## Modelo de datos

```prisma
model Log {
  id          Int         @id @default(autoincrement())
  timestamp   DateTime    @default(now())
  application String
  service     String?
  host        String?
  level       LogLevel                         // debug|info|warn|error
  environment Environment                      // development|staging|production
  message     String
  traceId     String?     @db.VarChar(128)
  spanId      String?     @db.VarChar(128)
  metadata    Json?                            // JSONB libre

  errorName   String?     @db.VarChar(200)     // clase de la excepción
  errorCode   String?     @db.VarChar(100)
  errorStack  String?
  fingerprint String?     @db.VarChar(64)      // huella de agrupación
}
```

Índices: `timestamp`, `application`, `level`, `environment`, `traceId`, `fingerprint` y los compuestos `(application, timestamp)`, `(level, timestamp)`, `(fingerprint, timestamp)` y `(environment, level, timestamp)`. Cubren los patrones dominantes: "logs de la app X por fecha", "errores recientes", "ocurrencias de este fallo" y la agrupación por entorno.

`metadata` es JSONB **libre**: cada aplicación adjunta su contexto sin migraciones. La validación exige solo `application`, `level`, `environment` y `message`.

### Por qué una huella

Dos ocurrencias del mismo fallo casi nunca tienen el mismo mensaje: llevan dentro el id del pedido, un UUID o una hora. Sin normalizar eso, cuatrocientas repeticiones de un timeout aparecen como cuatrocientos problemas distintos y no hay forma de saber qué está roto.

`fingerprint` es un sha256 recortado de la parte **estable** del error: aplicación, servicio, clase, código, primer marco del stack sin números de línea (que se desplazan al recompilar) y el mensaje normalizado, con números, UUIDs, correos, URLs y cadenas entrecomilladas sustituidos por marcadores.

Se calcula en el servidor para `error` y `warn`. Un emisor puede mandar la suya para agrupar con otro criterio.

### Otras entidades

```prisma
model User         { id, email @unique, passwordHash, role, createdAt, refreshTokens[], apiKeys[] }
model RefreshToken { id, token @unique (jti), userId → User, expiresAt, revokedAt? }
model ApiKey       { id, name, prefix @unique, keyHash @unique, scopes[], applications[],
                     createdById? → User, expiresAt?, lastUsedAt?, revokedAt? }
model AlertChannel { id, name, type, config Json, enabled }
model AlertRule    { id, name, type, filtros, threshold, windowMinutes, cooldownMinutes,
                     lastTriggeredAt?, channels[] }
model AlertEvent   { id, ruleId → AlertRule, triggeredAt, count, sampleLogIds[], deliveries Json }
```

## Flujo de una petición de ingesta

1. `helmet` → CORS → `express.json` (límite 3 MB) → `requestContext` (requestId/traceId) → `requestLogger`.
2. `ingestLimiter` (2000 req/min por defecto), contabilizado **por clave** y no por IP, para que una integración ruidosa no consuma la cuota de las que comparten salida.
3. `requireIngest` → `normalizeErrorFields` (vuelca el objeto `error` a columnas) → validación → cálculo de huella → `createLog`/`createLogsBatch` → 201.
4. Se emite el evento en memoria que alimenta el stream en vivo.

## Análisis de errores

La agrupación va en dos pasos a propósito:

1. La **agregación** usa la API tipada de Prisma, de modo que reutiliza tal cual los filtros de visibilidad de la clave.
2. El **ejemplo de cada grupo** sale de una única consulta en crudo con `DISTINCT ON`, que no tiene equivalente en Prisma y que aprovecha el índice `(fingerprint, timestamp)`.

Alrededor de eso: traza completa por `traceId`, contexto temporal alrededor de un log, inventario de aplicaciones y serie por hora y nivel.

## Servidor MCP

`POST /mcp` habla Model Context Protocol sobre HTTP y expone ocho herramientas que llaman a los servicios **en proceso**, sin dar la vuelta por HTTP.

Dos decisiones gobiernan las respuestas:

- **Todo lo devuelto consume contexto del modelo**, así que los listados van recortados y sin metadata; solo `get_log` entrega el registro entero.
- **Cuando hay más resultados de los devueltos se dice explícitamente**, para que el modelo no concluya que ya lo ha visto todo.

El endpoint es **sin estado**: cada petición crea su servidor y su transporte y los destruye al cerrar la respuesta. Cuesta poco y a cambio el backend sigue escalando horizontalmente sin sesiones pegadas a una instancia.

## Alertas

Un planificador evalúa cada minuto las reglas activas. Dos tipos: **umbral** (N coincidencias en la ventana) y **error nuevo** (una huella cuya primera aparición cae dentro de la ventana; se resuelve con `HAVING MIN(timestamp) >= …`).

Cada regla lleva un **cooldown**, sin el cual un incidente de una hora generaría sesenta avisos idénticos. Arranca aunque el envío falle: reintentar cada minuto contra un canal caído solo multiplica el ruido cuando vuelva.

Los notificadores viven tras una interfaz común y se registran en una tabla sustituible, lo que permite probarlos sin salir a la red. Un canal caído no impide avisar por los demás ni frena la evaluación del resto de reglas; el resultado de cada envío queda en `AlertEvent`.

## Tiempo real

`GET /api/logs/stream` emite los logs según se ingieren, por Server-Sent Events y no WebSocket, porque el flujo es de un solo sentido: el servidor empuja y el cliente no habla. SSE va sobre HTTP normal, el navegador lo reconecta solo y atraviesa los proxys sin nada especial, siempre que el proxy no acumule la respuesta (resuelto en el Caddyfile con `flush_interval -1`).

**El bus de eventos es por instancia.** Con varias réplicas, cada cliente ve solo los logs que entraron por la suya. Hacerlo global pide `LISTEN/NOTIFY` de PostgreSQL o un Redis, y a esta escala no compensa la complejidad.

## Rendimiento y escalabilidad

**Hoy (una instancia):**

- Lotes de hasta 500 logs por petición, con un solo `INSERT` vía `createMany`.
- Exportaciones limitadas a `MAX_EXPORT_ROWS` (10 000) para no agotar memoria.
- Paginación obligatoria (máx. 200 por página) con `findMany` + `count` en una transacción.
- Purga en lotes de 5000 filas cediendo el control entre uno y otro: un único `DELETE` sobre millones de filas bloquearía la tabla y competiría con la ingesta.
- El proceso es **stateless**: escala horizontalmente detrás de un balanceador sin cambios.

**Al escalar horizontalmente, dos cosas dejan de comportarse igual:** el rate limiting es por instancia (vive en memoria), así que el límite efectivo se multiplica; y `SCHEDULER_ENABLED` debe quedar activo en una sola, porque varias purgas o evaluaciones simultáneas compiten sin aportar nada.

**Camino de crecimiento (en orden de necesidad):**

1. **Retención**: ya automática vía `RETENTION_DAYS`. Ajustarla es lo primero si el disco crece.
2. **Particionamiento por rango de `timestamp`** cuando la tabla supere decenas de millones de filas: las purgas pasan a ser `DROP PARTITION`.
3. **Réplicas de lectura** si las consultas compiten con la ingesta.
4. **Difusión de eventos** con `LISTEN/NOTIFY` o Redis, si el stream en vivo debe ser global entre réplicas.
5. **Cola intermedia** solo si la ingesta supera lo que PostgreSQL absorbe directo; no antes: es complejidad sin beneficio a baja escala.
6. **Búsqueda full-text** (`tsvector` o índice GIN sobre `metadata`) si `ILIKE` deja de ser suficiente.

## Observabilidad del propio servicio

- `GET /health` verifica servidor y base de datos, e informa de versión y tiempo en marcha.
- `GET /metrics` publica, además de las métricas del proceso, la duración de las peticiones por método, ruta y estado (etiquetada por **patrón** de ruta y no por URL, que generaría una serie por cada id), los logs ingeridos por aplicación y nivel, y las conexiones en vivo abiertas.
- Logs propios: winston JSON a consola y `logs/app.log` (rotación 10 MB × 5). Una línea por petición; el body solo en `LOG_LEVEL=debug`, con secretos redactados.
- En producción, los 5xx responden un mensaje genérico: el detalle queda en el log, localizable por `requestId`.
- `assertProductionConfig()` impide arrancar en producción con secretos por defecto o CORS abierto.

## Frontend

- Next.js 14 App Router; todo el dashboard es client-side (los datos son privados y dinámicos, el SSR no aporta).
- React Query gestiona cache y reintentos; `placeholderData: keepPreviousData` evita parpadeos al paginar.
- El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 y redirige a `/login` si falla: el guard de sesión es el propio backend.
- Los filtros viven en la URL: compartir el enlace reproduce la vista exacta.
- Los enlaces de administración se ocultan según el rol, y **las páginas lo comprueban por su cuenta**: ocultar un enlace no es un control de acceso.
- El gráfico de actividad rellena en el cliente las horas sin registros, porque la API solo devuelve las que tienen filas y pintarlas seguidas juntaría horas no contiguas.

## Estructura del backend

```
src/
  index.ts          arranque: valida config, conecta con reintentos, crea admin, planificador, apagado ordenado
  app.ts            composición de middlewares y rutas
  config/           env, logger, prisma, swagger, metrics, version
  middlewares/      auth (clave/JWT/rol), validación, rate limits, contexto, logging, errores
  routes/           authRoutes, logRoutes, apiKeyRoutes, alertRoutes
  controllers/      logController, analysisController, streamController
  services/         logService, analysisService, authService, apiKeyService, userService
  alerts/           evaluator + notifiers (webhook, email, telegram)
  mcp/              server (herramientas) + router (transporte HTTP)
  events/           bus en memoria para el stream en vivo
  jobs/             planificador de retención, limpieza y alertas
  utils/            fingerprint
prisma/             schema + migrations (0001–0007)
tests/              vitest + supertest contra DB real (11 suites)
```
