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

---

## 1. Ingesta de logs

Recibe y almacena eventos de cualquier aplicación capaz de hacer una petición HTTP.

**Quién:** aplicaciones emisoras, autenticadas con `x-api-key` (o con JWT de usuario).
**Código:** [logRoutes.ts](../Back_MCLog/src/routes/logRoutes.ts) → [validateLog.ts](../Back_MCLog/src/middlewares/validateLog.ts) → [logController.ts](../Back_MCLog/src/controllers/logController.ts) → [logService.ts](../Back_MCLog/src/services/logService.ts)

### 1.1 Log individual — `POST /api/log`

Inserta un evento. Devuelve `201` con el registro creado (incluido su `id`).

```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" -H "x-api-key: dev-key" \
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
| `message` | ✅ | 100 000 chars | — |
| `service` | — | 120 chars | el valor de `application` |
| `host` | — | 255 chars | hostname de la petición |
| `timestamp` | — | ISO-8601 | momento de la inserción |
| `traceId` | — | 128 chars | UUID generado por petición |
| `spanId` | — | 128 chars | — |
| `metadata` | — | objeto JSON libre | — |

### 1.4 Enriquecimiento automático

El servidor **completa** lo que la aplicación no envía: `service`, `host` y `traceId` se rellenan solos ([`toCreateInput`](../Back_MCLog/src/controllers/logController.ts)). Una app puede enviar únicamente los 4 campos obligatorios y aun así obtener registros útiles y correlacionables.

### 1.5 Metadata libre

`metadata` es un campo **JSONB sin esquema**: cada aplicación adjunta el contexto que necesite (ids de registro, usuario, stack trace, tiempos) sin que haya que migrar la base de datos. La única validación es que sea un objeto (no un array).

---

## 2. Consulta y búsqueda

`GET /api/logs` — listado paginado con filtros combinables. **Requiere JWT**: la API key nunca da acceso de lectura.

**Código:** [validateLogQuery.ts](../Back_MCLog/src/middlewares/validateLogQuery.ts) → [logController.ts](../Back_MCLog/src/controllers/logController.ts) → [`buildWhere`](../Back_MCLog/src/services/logService.ts)

### 2.1 Filtros

| Filtro | Comportamiento |
|---|---|
| `application`, `service`, `host` | Coincidencia parcial, **insensible a mayúsculas** (`contains`) |
| `traceId` | Coincidencia **exacta** |
| `level`, `environment` | Valor exacto del enum |
| `from` / `to` | Rango ISO-8601, **combinables** en una sola condición sobre `timestamp` |
| `search` | Busca en `message`, `application`, `service`, `host` (parcial) **y** `traceId` (exacto), unidos por `OR` |

Todos son opcionales y se acumulan con `AND`.

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

Las cinco consultas se lanzan en paralelo con `Promise.all`. El dashboard las refresca cada 60 segundos.

---

## 4. Exportación

`GET /api/logs?format=csv` o `format=ndjson` — descarga masiva **respetando los filtros activos**.

**Código:** [`getLogs`](../Back_MCLog/src/controllers/logController.ts) → [`exportLogs`](../Back_MCLog/src/services/logService.ts)

- **CSV** — cabecera `id, timestamp, application, service, host, level, environment, message, traceId`, con escapado correcto de comillas, comas y saltos de línea. Abre directo en Excel.
- **NDJSON** — un objeto JSON completo por línea, **incluida la metadata**. Ideal para `jq`, ingestión en otra herramienta o procesado por streaming.

Ignora la paginación y devuelve hasta `MAX_EXPORT_ROWS` (10 000 por defecto) filas — un tope explícito para no agotar la memoria del proceso con una consulta abierta.

---

## 5. Retención y purga

`DELETE /api/logs?before=<ISO>[&application=<nombre>]` — borra logs anteriores a una fecha, opcionalmente de una sola aplicación.

**Quién:** solo usuarios con rol **`admin`**.
**Código:** [`purgeLogs`](../Back_MCLog/src/controllers/logController.ts) → [`deleteLogsBefore`](../Back_MCLog/src/services/logService.ts)

`before` es obligatorio y debe ser ISO-8601 — no existe forma de borrar "todo" por accidente. Devuelve `{ "deleted": n }` y deja constancia de la operación en los logs del servicio.

> La tabla `Log` **crece sin límite** si no se purga. Esta operación está pensada para ejecutarse desde un cron. Ver [USER_GUIDE.md](USER_GUIDE.md#c5-retención-de-logs).

---

## 6. Autenticación y sesiones

Dos planos completamente separados, por diseño:

| Plano | Quién | Mecanismo | Puede leer |
|---|---|---|---|
| **Ingesta** | Máquinas (NetSuite, scripts, servicios) | `x-api-key` | ❌ No |
| **Consulta** | Personas (dashboard) | JWT access + refresh | ✅ Sí |

**Consecuencia de seguridad:** si una API key se filtra, el atacante puede *escribir* logs basura, pero **no puede leer** los logs de nadie.

**Código:** [authService.ts](../Back_MCLog/src/services/authService.ts), [requireAuth.ts](../Back_MCLog/src/middlewares/requireAuth.ts), [authApiKey.ts](../Back_MCLog/src/middlewares/authApiKey.ts)

### 6.1 Login — `POST /auth/login`

Email + contraseña (bcrypt, coste 12). Devuelve los tokens por **tres vías** simultáneas: body JSON, headers `x-access-token`/`x-refresh-token` y **cookies httpOnly** — así sirve tanto a un navegador como a un script.

### 6.2 Refresh con rotación — `POST /auth/refresh`

Cada refresh token se persiste por su `jti` en la tabla `RefreshToken`. Al usarlo:

1. Se valida la firma y que el registro exista, no esté revocado y no haya expirado.
2. **Se elimina el registro anterior** y se emite un par nuevo.

Es decir, un refresh token **es de un solo uso**. Si alguien roba uno y la víctima lo usa antes, el robado deja de servir.

### 6.3 Auto-refresh transparente

Cuando el access token expira, [`requireAuth`](../Back_MCLog/src/middlewares/requireAuth.ts) **no devuelve 401 directamente**: intenta refrescar con el refresh token (header o cookie), y si lo consigue, sirve la petición y renueva las cookies en la misma respuesta. El usuario nunca ve un corte de sesión mientras esté activo.

### 6.4 Logout — `POST /auth/logout`

Revoca el refresh token en base de datos y limpia las cookies. Idempotente: un token inválido no produce error.

### 6.5 Administrador inicial

Al arrancar, si `ADMIN_EMAIL` y `ADMIN_PASSWORD` están definidos y el usuario no existe, se crea con rol `admin` ([`ensureAdminUser`](../Back_MCLog/src/services/authService.ts)). No hay que sembrar la base a mano.

---

## 7. Autorización por roles

**Código:** [requireRole.ts](../Back_MCLog/src/middlewares/requireRole.ts)

| Rol | Puede |
|---|---|
| `user` | Consultar, buscar, ver estadísticas y exportar |
| `admin` | Todo lo anterior **+ purgar logs** (`DELETE /api/logs`) |

Sin sesión → `401`. Con sesión pero rol insuficiente → `403`.

---

## 8. Dashboard web

Aplicación Next.js 14 en el puerto 3001. Manual completo en [USER_GUIDE.md](USER_GUIDE.md).

**Código:** [frontend_mclog/src/](../frontend_mclog/src/)

| Funcionalidad | Detalle |
|---|---|
| **Login** | Formulario email/contraseña; el front nunca manipula tokens (viven en cookies httpOnly) |
| **Tarjetas de resumen** | Total, últimas 24 h, errores/warnings y app más activa; refresco automático cada 60 s |
| **Filtros combinables** | Nivel, entorno, aplicación, búsqueda libre, rango desde/hasta |
| **Búsqueda con debounce** | 350 ms de espera: no lanza una consulta por cada tecla |
| **Ordenación** | Por fecha, aplicación, nivel, host o entorno, asc/desc |
| **Paginación** | 10 / 25 / 50 / 100 por página, con navegación anterior/siguiente |
| **Detalle expandible** | Clic en una fila muestra host, traceId, mensaje completo y la metadata formateada |
| **Badges por severidad** | Color por nivel para localizar errores de un vistazo |
| **Export** | Botones CSV y NDJSON que aplican los filtros activos |
| **Filtros en la URL** | `?level=error&application=x&from=...` — copiar el enlace reproduce la vista exacta |
| **Estados de carga** | Skeletons al cargar; al refiltrar se mantiene la tabla anterior atenuada (sin parpadeo) |
| **Sesión automática** | Un 401 dispara un reintento vía `/auth/refresh`; si falla, redirige a `/login` |

---

## 9. Clientes de integración

No hace falta ningún cliente —basta un `POST` HTTP— pero hay dos listos para usar. Guía completa en [INTEGRATION.md](INTEGRATION.md).

### 9.1 Librería Node.js — `@enviromentmc/mclog`

**Código:** [Back_MCLog/log-service-lib/](../Back_MCLog/log-service-lib/)

Paquete npm publicable, con **cero dependencias en runtime** (usa `fetch` nativo, Node ≥18):

- `createMCLogClient()` con helpers `debug` / `info` / `warn` / `error`, `send` y `sendBatch`.
- **Troceado automático** de lotes al tamaño máximo del servidor.
- **A prueba de fallos**: si MCLog no responde, la función devuelve `false` y tu aplicación sigue. No escribe en tu consola; puedes engancharte con `onError` o pedir excepciones con `throwOnError`.
- Defaults de aplicación, entorno, servicio, host y metadata para no repetirlos en cada llamada.
- Entry point aparte `@enviromentmc/mclog/express` con el middleware `validateLog`, para que quien solo emita logs no arrastre Express.

### 9.2 Librería NetSuite — SuiteScript 2.1

**Código:** [integrations/netsuite/](../integrations/netsuite/)

Módulo para subir al File Cabinet. Adjunta automáticamente en `metadata` el `scriptId`, `deploymentId`, `accountId`, `userId` y el **governance restante** — contexto que en NetSuite es caro de reconstruir después. Incluye ejemplos de User Event y Map/Reduce.

---

## 10. Observabilidad del propio servicio

Quién vigila al vigilante. **Código:** [app.ts](../Back_MCLog/src/app.ts), [logger.ts](../Back_MCLog/src/config/logger.ts), [requestLogger.ts](../Back_MCLog/src/middlewares/requestLogger.ts)

| Endpoint / mecanismo | Qué aporta |
|---|---|
| `GET /health` | Verifica servidor **y** base de datos (`SELECT 1`). `200 ok` / `503 degraded`. Para load balancers y uptime checks |
| `GET /metrics` | Métricas Prometheus del proceso (CPU, memoria, event loop). **Protegido con API key** |
| Log por petición | Una línea JSON con `requestId`, `traceId`, método, URL, status y duración en ms |
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
| **Rate limiting doble** | `ingestLimiter` 2000/min y `queryLimiter` 600/15 min, **independientes**: un dashboard intensivo no puede bloquear la ingesta, ni al revés |
| **Límite de cuerpo** | 3 MB (`BODY_LIMIT`) |
| **API key en tiempo constante** | `crypto.timingSafeEqual`, para no filtrar la clave por diferencias de tiempo |
| **Cookies** | `httpOnly` siempre; `secure` y `sameSite` configurables; `secure` automático en producción |
| **HTTPS forzable** | `FORCE_HTTPS=1` rechaza peticiones no cifradas |
| **Validación en el borde** | `express-validator` en cada endpoint: tipos, enums, longitudes y formatos ISO |
| **Sin SQL injection** | Prisma parametriza todo; la ordenación usa lista blanca, no interpolación |
| **Guardia de producción** | `assertProductionConfig()` **impide arrancar** con `NODE_ENV=production` si quedan secretos por defecto o `CORS_ORIGINS` vacío |

---

## 12. Documentación de API interactiva

`GET /docs` — Swagger UI (OpenAPI 3) generado desde [swagger.ts](../Back_MCLog/src/config/swagger.ts). Permite explorar y probar los endpoints desde el navegador sin escribir un curl.

---

## Resumen de endpoints

| Método | Ruta | Auth | Funcionalidad |
|---|---|---|---|
| `POST` | `/api/log` | API key o JWT | [1.1](#11-log-individual--post-apilog) |
| `POST` | `/api/logs/batch` | API key o JWT | [1.2](#12-lote--post-apilogsbatch) |
| `GET` | `/api/logs` | JWT | [2](#2-consulta-y-búsqueda) · [4](#4-exportación) |
| `GET` | `/api/logs/stats` | JWT | [3](#3-estadísticas) |
| `GET` | `/api/logs/:id` | JWT | [2.4](#24-detalle-individual--get-apilogsid) |
| `DELETE` | `/api/logs` | JWT **admin** | [5](#5-retención-y-purga) |
| `POST` | `/auth/login` · `/auth/refresh` · `/auth/logout` | — | [6](#6-autenticación-y-sesiones) |
| `GET` | `/health` | — | [10](#10-observabilidad-del-propio-servicio) |
| `GET` | `/metrics` | API key | [10](#10-observabilidad-del-propio-servicio) |
| `GET` | `/docs` | — | [12](#12-documentación-de-api-interactiva) |
