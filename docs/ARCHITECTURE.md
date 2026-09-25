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
                   │   (puerto 3000)   │        │  Workspace · Snapshot│
                   └───┬───────────┬───┘        │  Alert{Channel,Rule, │
                       │           │            │        Event}        │
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
             │  Next.js 14       │        │  webhook · correo ·     │
             │   (puerto 3001)   │        │  Telegram               │
             └───────────────────┘        └─────────────────────────┘
                                                      ▲
                                          planificador cada minuto
```

## Topologías de despliegue

Las mismas dos imágenes (API y dashboard) se despliegan de dos formas. Guía completa en [DEPLOYMENT.md](DEPLOYMENT.md).

**Opción A — un VPS con Docker Compose.** Caddy sirve dashboard y API bajo **el mismo dominio** y es lo único que publica puertos. Sin CORS entre orígenes y con cookies `SameSite=Lax`.

```
Internet ──443──► Caddy ─┬─ /api/* /auth/* /mcp /docs /health ──► api:3000 ──► db:5432
  (un dominio)           └─ todo lo demás ─────────────────────► web:3001
                                              backup (pg_dump diario) ──► db
```

**Opción B — CapRover + Railway.** La API y PostgreSQL son **dos apps separadas** en CapRover, así que la API se puede redesplegar sin tocar la base, que no tiene dominio público. El dashboard vive en Railway, en **otro dominio**.

```
Navegador ──► dashboard.tu-dominio.com (Railway, Next standalone)
    │
    └──XHR con cookies──► api.tu-dominio.com (CapRover, nginx + TLS) ──► srv-captain--mclog-db:5432
                          CORS_ORIGINS = origen exacto del dashboard
```

Al separar los dominios, el navegador trata la API como otro origen:

- `CORS_ORIGINS` debe listar el dashboard.
- `NEXT_PUBLIC_API_URL` se fija al compilar el dashboard.
- Las cookies de sesión exigen HTTPS. Si los dominios no comparten sitio, además `COOKIE_SAMESITE=none`.

Por eso conviene usar **subdominios del mismo dominio raíz**.

## Autenticación: credenciales con alcance

| Credencial | Permite | Usada por |
|---|---|---|
| API key `ingest` | Escribir logs | Aplicaciones emisoras |
| API key `read` | Consultar logs y usar MCP | Asistentes de IA, integraciones |
| API key `metrics` | Leer `/metrics` | Prometheus |
| JWT de usuario | Consultar los espacios de los que es miembro; administrar los que posee. El `admin` de plataforma, todos | Personas, desde el dashboard (y el Lab) |

Decisiones clave:

- **Todo pertenece a un espacio de trabajo.** Logs, claves y alertas llevan `workspaceId`, y cada petición resuelve su espacio antes de tocar datos: el de la API key, o el de la cabecera `X-Workspace-Id` validando que la sesión sea miembro. Un espacio ajeno responde `404`. Dentro del espacio, `owner` administra y `member` solo observa; el `admin` de plataforma (la cuenta root incluida) administra la aplicación entera: gestiona cuentas y es dueño implícito de todos los espacios (`getWorkspaceRole`), sin figurar como miembro. Se eligió una columna por tabla (aislamiento lógico en una sola base) frente a un esquema o una base por espacio: mantiene una única migración y un único pool de conexiones, y el filtro obligatorio en el tipo (`LogFilters.workspaceId`) y los índices que empiezan por `workspaceId` lo hacen seguro y rápido.

- **Los permisos se separan porque el daño de una filtración lo define el permiso, no la clave.** Una clave de ingesta comprometida escribe logs basura; no expone nada de lo almacenado.
- **Una clave puede acotarse a una lista de aplicaciones**, y la restricción se aplica en escritura y en lectura, incluido el detalle por id, que responde `404` en lugar de `403` para no confirmar que el registro existe.
- **Ninguna API key administra nada ni sale de su espacio.** Purgar logs o administrar un espacio exige la sesión de su dueño.
- De cada clave **solo se guarda el sha256**. El secreto viaja en claro una única vez, al crearla.
- Las claves se aceptan en `x-api-key` y en `Authorization: Bearer`, porque los clientes MCP solo permiten cabeceras estándar. Un `Bearer` sin forma de clave MCLog se trata como JWT.
- El **refresh token se rota** en cada uso y se persiste por `jti`, con un margen de 30 s en el que el usado sigue valiendo (las peticiones simultáneas del dashboard comparten el mismo refresh); logout lo revoca, y cambiar contraseña o rol revoca todos los del usuario.
- `requireAuth` reintenta con el refresh token cuando el access token expiró, renovando cookies en la misma respuesta.
- **Segundo factor opcional (TOTP).** Con él activo, la contraseña solo produce un `mfaToken` de 5 minutos, firmado con un secreto derivado y una audiencia propia para que nunca valga como sesión. La sesión se abre en `/auth/login/2fa` con un código de la app o de recuperación. El último paso TOTP aceptado se guarda para que un código no se pueda reutilizar.
- **Cuenta root.** La de `ADMIN_EMAIL` queda marcada al arrancar y no se puede borrar ni degradar: el servicio nunca se queda sin una puerta de entrada. Un admin tampoco puede quitar el 2FA de otro usuario; si pudiera, una sesión de admin robada bastaría para tomar cualquier cuenta.
- **Tres limitadores independientes**: ingesta (por clave), consulta (por clave o IP) y login (solo fallos, por IP), para que ninguno pueda agotar la cuota de los otros.

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
model Workspace       { id, name, createdAt, deletedAt? }
model WorkspaceMember { workspaceId → Workspace, userId → User, role (owner|member) }
model User         { id, email @unique, passwordHash, role, isRoot, createdAt, activatedAt?,
                     twoFactorEnabled, twoFactorSecret?, twoFactorLastStep?, recoveryCodes[],
                     refreshTokens[], apiKeys[], memberships[] }
model RefreshToken { id, token @unique (jti), userId → User, expiresAt, revokedAt? }
model ApiKey       { id, workspaceId → Workspace, name, prefix @unique, keyHash @unique, scopes[], applications[],
                     createdById? → User, expiresAt?, lastUsedAt?, revokedAt? }
model AlertChannel { id, workspaceId → Workspace, name, type, config Json, enabled }
model AlertRule    { id, workspaceId → Workspace, name, type, filtros, threshold, windowMinutes, cooldownMinutes,
                     lastTriggeredAt?, channels[] }
model AlertEvent   { id, ruleId → AlertRule, triggeredAt, count, sampleLogIds[], deliveries Json }
model AppSetting   { key @id, value Json, updatedAt, updatedById? → User }
model AppSettingChange { id, key, fromValue Json, toValue Json, reset, changedById? → User, changedByEmail, createdAt }
model Snapshot     { id, workspaceId → Workspace, token @unique, title, visibility (workspace|public), redacted,
                     filters Json, summary Json, logs Json, totalMatched, createdById? → User, expiresAt?, viewCount }
```

## Flujo de una petición de ingesta

1. `helmet` → CORS → `cookieParser` → `express.json` (límite 3 MB) → `requestContext` (requestId/traceId) → `requestLogger` → `enforceHttps`.
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

## Snapshots compartibles

Un snapshot es una **copia**, no una consulta guardada: al crearlo, el backend ejecuta la misma consulta que la vista (con el rango ya cerrado en ese instante), guarda el resumen y hasta `maxSnapshotRows` logs en JSONB y devuelve un token. Leerlo después no toca la tabla `Log`.

- **Por qué copia.** Una vista compartida no debe cambiar mientras se discute ni desaparecer con la retención. Y un enlace público que consultara `Log` en vivo tendría que aplicar visibilidad y enmascarado en cada visita; con la copia se hace una vez.
- **Enmascarado en el servidor.** Los públicos pasan por `utils/redact.ts` (el mismo juego de reglas que los reportes del frontend) antes de guardarse. No depende de que el cliente lo haya hecho.
- **Lectura en dos fases.** Primero se carga lo necesario para decidir el acceso (visibilidad, caducidad, espacio) y solo después los datos, que pueden pesar megas: un enlace de equipo abierto sin sesión, o por alguien de fuera, no los carga.
- **Denegar sin revelar.** Inexistente, caducado, de otro espacio o público con los públicos apagados responden igual (`404`). La única distinción es `401` para un enlace de equipo sin sesión, que no revela nada más que "entra para verlo".
- **`/api/share`, sin espacio activo.** `GET /api/share/:token` no depende del espacio activo (el enlace ya dice cuál es), y el cliente del panel no espera a resolver un espacio que el visitante puede no tener. Va bajo `/api` para que Caddy (opción A) lo mande a la API sin reglas nuevas.
- **Tres tipos, un modelo.** `kind` (`logs`, `errors`, `trace`) decide qué se captura y la forma de `summary` y `logs`; el resto (visibilidad, enmascarado, caducidad, topes, lectura) es común.
- **Vista previa en el servidor del dashboard.** El robot de Slack o WhatsApp no ejecuta JavaScript, así que el layout de `/s/[token]` (servidor de Next) pide `GET /api/share/:token/preview` y rellena las etiquetas Open Graph; `opengraph-image` dibuja la tarjeta con `next/og`. En Compose el servidor de Next llega a la API por la red interna (`API_INTERNAL_URL=http://api:3000`), porque `NEXT_PUBLIC_API_URL` va vacía. Solo los públicos dan datos: de uno de equipo sale una tarjeta genérica.

## Tiempo real

`GET /api/logs/stream` emite los logs según se ingieren, por Server-Sent Events y no WebSocket, porque el flujo es de un solo sentido: el servidor empuja y el cliente no habla. SSE va sobre HTTP normal, el navegador lo reconecta solo y atraviesa los proxys sin nada especial, siempre que el proxy no acumule la respuesta (resuelto en el Caddyfile con `flush_interval -1`).

**El bus de eventos es por instancia.** Con varias réplicas, cada cliente ve solo los logs que entraron por la suya. Hacerlo global pide `LISTEN/NOTIFY` de PostgreSQL o un Redis, y a esta escala no compensa la complejidad.

## Rendimiento y escalabilidad

**Hoy (una instancia):**

- Lotes de hasta 500 logs por petición, con un solo `INSERT` vía `createMany`.
- Exportaciones limitadas a `MAX_EXPORT_ROWS` (10 000) para no agotar memoria.
- Paginación obligatoria (máx. 200 por página) con `findMany` + `count` en una transacción.
- Respuestas JSON comprimidas (brotli o gzip, según `Accept-Encoding`) a partir de 1 KB, de forma asíncrona para no bloquear el bucle de eventos. Sin dependencias (`zlib`). No toca el stream en vivo ni las descargas CSV/NDJSON, que escriben por su cuenta; detrás de Caddy, `encode` ya los comprime.
- Purga en lotes de 5000 filas cediendo el control entre uno y otro: un único `DELETE` sobre millones de filas bloquearía la tabla y competiría con la ingesta.
- Sesiones, claves y logs viven en PostgreSQL, así que la API puede correr en varias instancias detrás de un balanceador.

**Al escalar horizontalmente, tres cosas dejan de comportarse igual:**

- **Rate limiting**: vive en memoria y es por instancia, así que el límite efectivo se multiplica.
- **Planificador**: `SCHEDULER_ENABLED` debe quedar activo en una sola instancia, porque varias purgas o evaluaciones simultáneas compiten sin aportar nada.
- **Stream en vivo**: su bus y su tope de conexiones son por instancia.

**Camino de crecimiento (en orden de necesidad):**

1. **Retención**: ya automática, entre 3 meses y 5 años (`retentionMonths`, ajustable por la cuenta root). Bajarla es lo primero si el disco crece.
2. **Particionamiento por rango de `timestamp`** cuando la tabla supere decenas de millones de filas: las purgas pasan a ser `DROP PARTITION`.
3. **Réplicas de lectura** si las consultas compiten con la ingesta.
4. **Difusión de eventos** con `LISTEN/NOTIFY` o Redis, si el stream en vivo debe ser global entre réplicas.
5. **Cola intermedia** solo si la ingesta supera lo que PostgreSQL absorbe directo; no antes: es complejidad sin beneficio a baja escala.
6. **Búsqueda full-text** (`tsvector` o índice GIN sobre `metadata`) si `ILIKE` deja de ser suficiente.

## Observabilidad del propio servicio

- `GET /health` verifica servidor y base de datos, e informa de versión y tiempo en marcha.
- `GET /metrics` publica, además de las métricas del proceso, la duración de las peticiones por método, ruta y estado (etiquetada por **patrón** de ruta y no por URL, que generaría una serie por cada id), los logs ingeridos por aplicación y nivel, y las conexiones en vivo abiertas.
- Logs propios: winston JSON a consola y `logs/app.log` (rotación 10 MB × 5). Una línea `HTTP request` por petición, con nivel según el resultado: las normales en `http` (ocultas con el `LOG_LEVEL=info` por defecto), los 4xx en `info`, las lentas (≥ 1 s) en `warn` y los 5xx en `error`. El body solo en `LOG_LEVEL=debug`, con secretos redactados.
- En producción, los 5xx responden un mensaje genérico: el detalle queda en el log, localizable por `requestId`.
- `assertProductionConfig()` impide arrancar en producción con secretos por defecto, secretos JWT iguales o CORS abierto.
- `FORCE_HTTPS` exime a las peticiones de loopback: el `HEALTHCHECK` del contenedor llama por HTTP plano desde dentro y, sin la exención, el orquestador lo reiniciaría en bucle.

## Frontend

- Next.js 14 App Router con `output: "standalone"`. El acceso (`/`), el visor de snapshots (`/s/<token>`) y todo el dashboard son client-side: los datos son privados y dinámicos, y el SSR no aporta.
- React Query gestiona cache y reintentos; `placeholderData: keepPreviousData` evita parpadeos al paginar.
- El interceptor de axios reintenta una vez con `/auth/refresh` ante un 401 (un único refresh en vuelo: las peticiones que caducan a la vez esperan al mismo) y redirige al acceso (`/`) si falla, salvo en `/auth/me`, que el propio acceso consulta para saber si hay sesión, y en `/api/share/:token`, cuyo 401 el visor convierte en "inicia sesión para verlo"; `DashboardLayout` manda a `/?next=` si `/auth/me` falla. El guard de sesión es el propio backend.
- El login es una pequeña máquina de estados de dos pasos: contraseña y, si la cuenta tiene 2FA, código. El `mfaToken` solo vive en memoria del formulario.
- **Registros** reutiliza tabla, filtros e inspector de Logs, y suma seis filtros por campo que viajan en la URL. En las dos el detalle del log es el mismo diálogo, que el visor de snapshots usa en modo de solo lectura.
- **Lab** envía logs reales con la sesión del admin, en lotes de 100 o de uno en uno para el stream. Hay un `AbortController` por escenario, y todo va a aplicaciones `lab-*`, que se purgan de una vez.
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
  routes/           authRoutes, logRoutes, apiKeyRoutes, alertRoutes, workspaceRoutes, settingsRoutes, snapshotRoutes
  controllers/      logController, analysisController, streamController
  services/         logService, analysisService, authService, apiKeyService, userService, twoFactorService,
                    passwordResetService, workspaceService, settingsService, snapshotService
  alerts/           evaluator + notifiers (webhook, email, telegram)
  mcp/              server (herramientas) + router (transporte HTTP)
  events/           bus en memoria para el stream en vivo
  jobs/             planificador de retención, limpieza, alertas, purga de espacios y de snapshots caducados
  utils/            fingerprint, totp (RFC 6238), qrCode (QR a SVG, sin dependencias), redact (enmascarado)
prisma/             schema + migrations (0001–0013)
tests/              vitest + supertest contra DB real (19 suites, 238 tests)
entrypoint.sh       aplica las migraciones y arranca (imagen Docker / CapRover)
captain-definition  despliegue en CapRover con el mismo Dockerfile
```
