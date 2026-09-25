# Changelog

Todos los cambios relevantes de MCLog (API, dashboard, librería, integraciones, despliegue y sitio público) se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto todavía no etiqueta versiones, así que las entradas se agrupan por fecha. La API y el dashboard están en la **1.0.0** y la librería `@multicomputos-srl/mclog` en la **1.3.0**, que se versiona por separado (semver).

Las entradas marcadas con **⚠ Requiere acción** obligan a tocar la configuración o el despliegue al actualizar.

## [Sin publicar]

### Añadido
- **NetSuite — `lib_mclog.js`, librería central descargable.** Lee la URL, la API key, la aplicación y el ambiente de un registro personalizado (`customrecord_mclog_config`), con 5 minutos de caché en `N/cache`. Acumula los logs y envía un solo lote al terminar cada punto de entrada. `wrapEntryPoints` pone el contexto (registro y traceId `<tipo>:<id>` en User Events, clave en Map/Reduce, método en Suitelets) y registra las excepciones no controladas sin duplicar las que ya se registraron a mano. Rechaza URL `http://`, oculta credenciales en la metadata y respeta la governance. Incluye 114 pruebas sin dependencias (`test_lib_mclog.js`), que corren en CI.
- **Sitio:** guía "Integrar NetSuite con lib_mclog.js", con enlaces de descarga, creación del registro, ejemplos por tipo de script y solución de problemas.

## 2026-09-25

### Añadido
- **Dashboard/API — Historial de configuración:** cada cambio de un ajuste de plataforma guarda quién lo hizo, cuándo y el valor anterior y el nuevo, restablecimientos incluidos. Se consulta en la sección "Historial de cambios" de `/settings/platform` o con `GET /api/settings/history` (paginado con `limit` y `before`). Migración `0015_app_setting_history`.
- **Dashboard — Ver u ocultar contraseña** en todos los campos de contraseña: restablecer, cambiar, usuarios, borrar cuenta y 2FA.
- **Dashboard — Vista previa de enlaces:** cualquier enlace al panel (login, restablecer contraseña, páginas internas) muestra ahora título, descripción e imagen con el logo al pegarlo en Teams, Slack o WhatsApp. Antes solo la tenían los snapshots.
- **Dashboard — Cuentas:** `/settings/users` muestra los espacios de cada cuenta con su rol y lleva a ellos con un clic.

### Cambiado
- **API — Retención en meses.** ⚠ **Requiere acción:** `RETENTION_DAYS` desaparece y la sustituye `RETENTION_MONTHS` (3 por defecto, entre 3 y 60). El ajuste `retentionDays` pasa a `retentionMonths`, y la migración `0014_retention_months` convierte el valor guardado. La purga ya no se puede desactivar.
- **API — Qué ve cada cuenta:** una cuenta `user` solo ve los espacios de los que es miembro, y el rol `admin` actúa como dueño de todos.
- **API — Logs de peticiones menos ruidosos:**
  - Las peticiones normales salen en nivel `http` y no aparecen con `LOG_LEVEL=info`.
  - Los 4xx salen en `info`, y los que llegan al manejador de errores como "Request rejected" (`warn`).
  - Las peticiones lentas (≥ 1 s) y los orígenes CORS rechazados salen en `warn`, y los 5xx en `error`.
- **Sitio:** la retención se describe como "de 3 meses a 5 años".

### Corregido
- **API — `CORS_ORIGINS`:** se quita la barra final de cada origen. `https://app.com/` nunca coincidía con el `Origin` del navegador.
- **API:** los errores registrados incluyen `name`, `message` y `stack`. Antes solo salía `{"status":403}`.

### Seguridad
- **API:** el manejador de errores ya no vuelca en el log el cuerpo crudo de la petición, que podía contener contraseñas.

### Eliminado
- La variable `RETENTION_DAYS` y la opción "0 = no purgar nunca".

## 2026-09-24

### Añadido
- **Snapshots de Errores y de Trazas**, además de los de Logs. Migración `0013_snapshot_kinds`, con un nuevo ajuste `maxSnapshotsPerWorkspace` (100).
- **Vista previa en chats de los enlaces de snapshot** (Slack, WhatsApp, Teams): título, cifras e imagen generada con `next/og`. Los snapshots de equipo muestran una tarjeta genérica, sin su contenido. En la API, `GET /api/share/:token/preview`.
- **Dashboard — Trazas:** línea de tiempo en cascada y KPIs en `/trace/[traceId]`.
- **API:** las respuestas JSON de 1 KB o más se comprimen con brotli o gzip.
- **Despliegue:** variable `API_INTERNAL_URL` en el dashboard, para que el servidor de Next consulte la API por la red interna. `docker-compose.prod.yml` la fija en `http://api:3000`. ⚠ **Requiere acción** en despliegues separados, como Railway: sin ella no se generan las vistas previas.
- **Sitio:** guía "Compartir un snapshot" y tarjeta de snapshots en la landing.

### Cambiado
- **API:** la lectura de un snapshot pasa de `/snapshots/:token` a `/api/share/:token`.

## 2026-09-23

### Añadido
- **Espacios de trabajo (multi-inquilino):**
  - Logs, API keys, canales y reglas de alertas pertenecen a un espacio, con roles `owner` y `member`.
  - Todo lo existente pasa al espacio 1, "Principal": los admins como `owner` y el resto como `member`.
  - Endpoints en `/api/workspaces`: crear, renombrar, borrar (con `confirmName`), gestionar miembros y salir de un espacio.
  - El espacio se elige con la cabecera `X-Workspace-Id` (o `?workspace=` en el stream en vivo).
  - En el dashboard: selector de espacio en la barra lateral y página `/settings/workspace`.
  - Migración `0010_workspaces`.
- **Invitaciones:**
  - Al crear una cuenta se elige entre `own` (espacio propio) o `join` (entrar en un espacio existente).
  - La cuenta invitada queda pendiente hasta que elige su contraseña.
  - Si la cuenta ya existe, se le avisa por correo al añadirla a un espacio.
  - Sin SMTP, el panel muestra el enlace para copiarlo.
- **Configuración de plataforma en caliente** (solo la cuenta root):
  - Página `/settings/platform` y endpoints `/api/settings`.
  - Ajusta sin reiniciar: límites de miembros, invitaciones, espacios, exportación, lotes y conexiones en vivo; retención; caducidad del restablecimiento; y los interruptores de MCP, alertas y Lab.
  - Varias instancias se sincronizan cada 60 s.
  - Migración `0011_app_settings`.
- **Snapshots compartibles:**
  - Copia congelada de una vista de Logs o Registros, con botón "Compartir", página `/snapshots` y vista `/s/[token]`.
  - Visibilidad de equipo o pública (solo el dueño puede hacerla pública).
  - Caducidad de 1, 7 o 30 días, o sin caducidad, y recuento de visitas.
  - Nuevos ajustes `maxSnapshotRows` y `publicSnapshotsEnabled`.
  - Migración `0012_snapshots`.
- **Contraseña olvidada:**
  - Páginas `/forgot-password` y `/reset-password`, con un correo en español o inglés que lleva un enlace de un solo uso.
  - Endpoints `POST /auth/password/forgot` y `POST /auth/password/reset`.
  - Variables `PASSWORD_RESET_TTL_MINUTES` (30), `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` y `PASSWORD_RESET_RATE_LIMIT_MAX`.
  - Requiere `SMTP_HOST` y `PUBLIC_DASHBOARD_URL`; sin ellas el endpoint responde 503.
  - Migración `0009_password_reset`.
- **Reportes:**
  - Comparación con el periodo anterior: fallos nuevos, que empeoran o que dejan de aparecer.
  - Warnings agrupados opcionales y enlace a las ocurrencias de cada fallo.
  - Recuento de valores enmascarados y aviso cuando el brief pasa de unos 100k tokens.
  - Preferencias guardadas en el navegador y Ctrl+Enter para generar.
  - Esquemas `mclog.agent-report/v2` y `mclog.agent-brief/v2`.
- **Alertas:** los canales existentes se pueden editar. Un secreto que se deja vacío conserva el valor guardado.
- **Dashboard:**
  - Ayudas contextuales (ⓘ) en formularios y métricas.
  - Flechas ← → para recorrer los logs sin cerrar el detalle.
  - Enlaces a la documentación y al repositorio.
- **Sitio:** guía "Presentar MCLog: guion de una demo".

### Cambiado
- **Permisos por espacio:** gestionar API keys, alertas, la purga (`DELETE /api/logs`) y el Lab exige ser dueño del espacio, no admin de la plataforma. Consultas, stream, análisis y MCP quedan limitados al espacio de la petición. La `API_KEY` heredada escribe en el espacio por defecto de la cuenta root.
- **MCP:** `/mcp` se enciende y se apaga en caliente con el ajuste `mcpEnabled` (responde 404 si está apagado). `MCP_ENABLED` pasa a ser solo el valor inicial.
- **Dashboard:**
  - `/` es directamente el formulario de acceso (`/login` queda como alias) y tras entrar vuelve a la página pedida.
  - El detalle de un log siempre se abre como diálogo.
- **Contraseña mínima:** `PASSWORD_MIN_LENGTH` baja de 10 a 8 caracteres.
- ⚠ **Requiere acción:** la migración `0010_workspaces` recrea los índices de `Log` y bloquea las escrituras unos segundos. Conviene aplicarla fuera de hora punta.

### Corregido
- **Dashboard:** `/auth/me` sin sesión ya no redirige al login desde la portada.

### Seguridad
- **Restablecimiento de contraseña:**
  - El token se guarda como hash, sirve una sola vez y pedir otro invalida el anterior.
  - Máximo un correo por minuto y cuenta, con límite adicional por IP.
  - Usarlo cierra todas las sesiones.
  - La respuesta es la misma exista o no la cuenta.
  - El enlace se construye con `PUBLIC_DASHBOARD_URL`, nunca con la cabecera Host.
- **Invitaciones:** una cuenta invitada no puede iniciar sesión hasta activarse.
- **Aislamiento entre espacios:**
  - Un espacio ajeno responde 404.
  - Una API key nunca sale de su espacio.
  - Una regla no puede usar canales de otro espacio.
- **Snapshots públicos:**
  - Se enmascaran en el servidor (JWT, tokens, secretos, correos, IPs).
  - Se sirven con `no-store` y `noindex`, sin referrer.
  - Apagar `publicSnapshotsEnabled` deja de servir también los ya creados.
- **Configuración:** solo la cuenta root puede cambiarla.
- **Reportes:** la vista previa solo permite enlaces al propio origen de MCLog.

### Eliminado
- La portada pública del dashboard en `/`, reemplazada por el acceso.
- Los modos "panel lateral" y "cajón" del detalle de un log.

## 2026-09-22

### Añadido
- **Verificación en dos pasos (TOTP):**
  - Se configura con QR y 8 códigos de recuperación de un solo uso.
  - El login pasa a tener dos pasos (`POST /auth/login/2fa`), y activar o desactivar el 2FA pide contraseña y código.
  - Migración `0008_account_security`.
- **Eliminar la propia cuenta:** `DELETE /auth/me` y "Zona de peligro" en Mi cuenta. Pide la contraseña, y el código 2FA si está activo.
- **Cuenta root:** la cuenta de `ADMIN_EMAIL` no se puede borrar ni degradar. Si `ADMIN_EMAIL` cambia, la anterior pasa a ser un admin normal.
- **Página Registros (`/records`):** la tabla completa con búsqueda avanzada por mensaje, servicio, host, traceId, nombre y código de error. En la API se añaden los filtros `message`, `errorName` y `errorCode` en `GET /api/logs`.
- **Página Lab (`/lab`):**
  - 7 escenarios que envían logs reales a aplicaciones `lab-*`: tráfico, error agrupado, traza, pico, error nuevo, datos sensibles y en vivo.
  - Compositor de logs con vista de la petición en JSON y cURL.
  - Borrado de los datos del lab.
- **Docs:** 12 guías paso a paso en `docs/guias/` y Swagger ampliado (2FA, búsqueda avanzada, edición de alertas, códigos 403/413/429).

### Cambiado
- **API:** la rotación del refresh token tiene 30 s de margen, y el dashboard hace un único refresh aunque fallen varias peticiones a la vez. Así se evitan cierres de sesión inesperados.
- **API:** los `/health` correctos ya no se escriben en el log de peticiones, aunque la métrica los sigue contando.
- **Dashboard:** el login distingue credenciales inválidas, demasiados intentos, error del servidor y fallo de red o CORS.
- **Dependencias:** actualizaciones en backend y dashboard (express 4.22.3, axios 1.20.0, express-validator 7.3.2, qs 6.16.0, entre otras).

### Corregido
- **API:** con `FORCE_HTTPS` activo, el healthcheck del contenedor (loopback por HTTP) recibía 400 y el contenedor se reiniciaba en bucle.
- **API:** `x-forwarded-proto` se interpretaba mal cuando llegaba como lista.
- **Dashboard:** las consultas de la página de logs se lanzaban dos veces al abrirla.

### Seguridad
- **2FA:** un código no se puede reutilizar, los códigos de recuperación se guardan como hash, y el token intermedio del login lleva secreto y audiencia propios. El límite de intentos de login cubre también el segundo paso, la eliminación de la cuenta y la gestión del 2FA.

## 2026-09-21

### Añadido
- **Rediseño completo del dashboard:**
  - Español e inglés, y tema claro, oscuro o del sistema.
  - Escala hasta 4K, con menú lateral que se puede contraer.
  - Gráfico de actividad interactivo: arrastrar acota el rango.
  - Selector de rango con calendario.
  - Inspector de log con stack resaltado, contexto de ±2 min y "Copiar para IA".
  - Los filtros quedan en la URL.
- **Página Reportes (`/reports`):** informe Markdown, brief para agentes de IA o JSON, con enmascarado de correos, IPs, tokens y JWT, y estimación de tokens.
- **Errores y Trazas:** copiar un brief para IA por fallo; descargar la traza en `.md`.
- **API:**
  - `GET /api/logs/applications` acepta `?hours=` (24–744, 168 por defecto).
  - Los campos largos se recortan en la ingesta en vez de rechazarse (`message` 100 000, `errorStack` 50 000), y la longitud original queda en `metadata.mclogTruncated`.
- **Dashboard:** protección de rutas. Sin sesión redirige a `/login?next=…` y tras entrar vuelve a la ruta pedida.
- **Despliegue:**
  - CapRover para la API (`captain-definition` y `entrypoint.sh`, que aplica las migraciones al arrancar).
  - Railway para el dashboard: `PORT` se resuelve al arrancar.
- **Librería 1.3.0:** opción `maxBatchBytes` (1 MiB), para trocear los lotes también por tamaño, y `truncateLongFields`, que recorta igual que el servidor.
- **Integraciones (NetSuite):** los lotes se trocean también por tamaño (1 MB).
- Crédito "Patrocinado por Multicomputos SRL" en el dashboard y el sitio.

### Cambiado
- **Dashboard:** la vista de logs pasa de `/` a `/logs`.
- **Dashboard:** el menú se agrupa en "Observabilidad" y "Administración".
- **API:** la lista de aplicaciones (y su herramienta MCP) solo incluye las que tienen logs en la ventana consultada (7 días por defecto), en vez de recorrer toda la tabla.
- **API:** la imagen Docker pasa de Node 20 a Node 24.

### Seguridad
- **API:** corregido un ReDoS en el cálculo de la huella. Un mensaje de 100k caracteres bloqueaba el proceso unos 20 s.
- **Dashboard:** el parámetro `?next=` del login solo acepta rutas internas, para evitar una redirección abierta.

## 2026-09-20

### Añadido
- **Sitio público** en `site/`, publicado en GitHub Pages:
  - Landing y documentación en `/docs`, generada desde `docs/`.
  - Páginas legales, sitemap y robots.
- **Librería 1.2.0:**
  - Reintentos con espera exponencial ante fallos de red, timeout, 408, 429 y 5xx, respetando `Retry-After`. Opciones `maxRetries`, `retryBaseMs`, `batchConcurrency` y `onRetry`.
  - `validateLog` replica las reglas del servidor.
- **Integraciones (NetSuite):** `sendBatch` trocea en lotes de 500, y un trozo que falla no hace perder los demás. Tests propios en CI.
- `SECURITY.md`, con cómo reportar vulnerabilidades.

### Cambiado
- **API:** Prisma 6 → 7, con el driver `pg`. ⚠ **Requiere acción:** `DATABASE_URL` se lee desde `prisma.config.ts` y ya no desde `schema.prisma`.
- **Librería:** se mueve a `packages/mclog` y cambia de nombre: `@enviromentmc/mclog` → `@multicomputos-srl/mclog`. ⚠ **Requiere acción:** actualizar la dependencia y los imports.
- **Librería:** `@types/express` se declara como peer dependency opcional. Sin ella, `/express` no compilaba en TypeScript.
- **Marca:** paleta de Multicomputos (primario `#19607e`, ámbar `#ebae23`) en el dashboard y el sitio.
- `frontend_mclog/.env.local.example` pasa a llamarse `.env.example`.

### Corregido
- **Integraciones (NetSuite):** se perdía `errorCode` en los errores que traen `code`.

### Seguridad
- **API:** con `NODE_ENV=production` no arranca si `ADMIN_PASSWORD`, `API_KEY` o los secretos JWT conservan un valor de ejemplo (incluidos los de `deploy/.env.example`), ni si los dos secretos JWT coinciden.

## 2026-09-19

Primera versión del monorepo. Parte de una API de ingesta y consulta (`POST /api/log`, `POST /api/logs/batch`, `GET /api/logs`, estadísticas, login con JWT, Swagger, `/metrics`), un dashboard con tabla de logs, la librería 1.0.0 y el cliente de NetSuite. Sobre esa base se añadió:

### Añadido
- **API keys con permisos** `ingest`, `read` y `metrics`:
  - Acotables por aplicación, con caducidad y revocables.
  - Se aceptan en `x-api-key` o `Authorization: Bearer`.
  - Página `/settings/api-keys`, donde el secreto se muestra una sola vez.
- **Usuarios:** gestión desde `/settings/users`, cambio de la propia contraseña en `/settings/password` y `GET /auth/me`.
- **Errores estructurados:**
  - La ingesta acepta `error` {name, message, code, stack}.
  - Los `error`/`warn` se agrupan por huella.
  - Página `/errors` con conteo, primera y última vez.
- **Análisis:** aplicaciones, grupos de errores, traza por `traceId` (página `/trace/[traceId]`), contexto de un log y serie por hora y nivel en las estadísticas.
- **Servidor MCP** en `POST /mcp`, para que Claude Code, Cursor o Claude Desktop consulten los logs con ocho herramientas. Pide una clave `read`.
- **Alertas** por webhook (firmado con HMAC), correo o Telegram:
  - Reglas de umbral y de error nuevo, con cooldown.
  - Página `/settings/alerts`.
  - Variables `SMTP_*`.
- **Logs en vivo** por SSE (`GET /api/logs/stream`) y botón "en vivo" en el dashboard. Límite por instancia con `SSE_MAX_CONNECTIONS`.
- **Retención automática** con `RETENTION_DAYS` (sustituida el 2026-09-25 por `RETENTION_MONTHS`) y limpieza de sesiones caducadas.
- **Observabilidad:**
  - `/health` con versión y estado de la base de datos.
  - `GET /openapi.json`.
  - Métricas `http_request_duration_seconds`, `mclog_logs_ingested_total` y `mclog_sse_connections`.
- **Librería 1.1.0:** `captureException` y campos de error en `MCLogEntry`.
- **Integraciones (NetSuite):** `exception(mensaje, e, metadata)`, que entiende `SuiteScriptError`.
- **Despliegue de producción** en `deploy/`:
  - Docker Compose con Caddy, que resuelve el HTTPS automático y es el único servicio que publica puertos.
  - Copias diarias con `pg_dump` y rotación, y script de restauración.
  - CI en GitHub Actions.
- **Docs:** `DEPLOYMENT.md` y `AI_INTEGRATION.md`, y guía de usuario reescrita.

### Cambiado
- **API:** el límite de peticiones de ingesta y consulta se cuenta por API key, no por IP.
- **API:** `pageSize` se valida con un máximo de 200 en vez de recortarse en silencio.
- **API:** cambiar la contraseña o el rol de un usuario cierra sus sesiones.
- **API:** la `API_KEY` heredada sigue funcionando con permisos `ingest` y `metrics`, pero queda deprecada.
- **Dashboard:** `NEXT_PUBLIC_API_URL` queda vacía por defecto, con rutas relativas detrás de Caddy.
- La base de datos de desarrollo pasa al puerto 5435.

### Seguridad
- De cada API key solo se guarda el hash.
- Una clave acotada a ciertas aplicaciones no puede leer ni escribir en las demás.
- Límite de intentos de login fallidos (`LOGIN_RATE_LIMIT_*`).
- No se puede borrar ni degradar al último admin, ni borrarse a uno mismo.
- En producción, los 5xx no exponen detalles internos.
- Los secretos de los canales de alerta se devuelven enmascarados.
- Los contenedores corren sin privilegios y solo Caddy es accesible desde fuera.
