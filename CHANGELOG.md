# Changelog

Todos los cambios relevantes de MCLog (API, dashboard, librería, integraciones, despliegue y sitio público) se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Semantic Versioning](https://semver.org/lang/es/). La API y el dashboard comparten versión; la librería `@multicomputos-srl/mclog` se versiona por separado. Las entradas anteriores a la 2.0.0 se agrupan por fecha: entonces el proyecto aún no etiquetaba versiones (API y dashboard en la 1.0.0, librería hasta la 1.3.0).

Las entradas marcadas con **⚠ Requiere acción** obligan a tocar la configuración o el despliegue al actualizar.

## [2.0.0] — 2026-10-29

Versión mayor de la API y el dashboard, que reúne la hoja de ruta de mejoras: cálculos corregidos (fase 1), trazas legibles (fase 2), monitoreo esencial (fase 3), accesibilidad y dinamismo (fase 4) e integraciones (fase 5). `/health` y el servidor MCP anuncian **2.0.0**. Es mayor porque cambia comportamiento del que dependen las integraciones; ver las entradas con ⚠ **Requiere acción**: las estadísticas siguen la ventana, MCLog ya no inventa el `traceId`, algunas huellas cambian una vez y hay tres migraciones (`0017_trace_spans`, `0018_monitoring` y `0019_pagerduty_channel`).

**Librería `@multicomputos-srl/mclog` 1.4.0** (minor, compatible): el cliente y el middleware de validación aceptan `parentSpanId`, `durationMs` y `release`, con las mismas reglas que el servidor.

**Librería `@multicomputos-srl/mclog` 1.5.0** (minor, compatible): contexto de traza por petición con `AsyncLocalStorage` (`withContext`, `getContext`, `traceHeaders`), el middleware `traceContext()` (lee o crea `traceparent`/`x-trace-id`, y cada petición es un tramo), `child()` para otros valores por defecto, `startSpan()` con `run()` y `end()` (registra `durationMs` y `parentSpanId`) y `release` por defecto desde `MCLOG_RELEASE`. Sin dependencias nuevas: solo módulos de Node.

### Añadido
- **API — Ingesta OpenTelemetry (OTLP/HTTP JSON)** en `POST /v1/logs`, la ruta estándar de los exportadores. Usa la misma API key `ingest` (en `x-api-key` o `Authorization: Bearer`), el mismo límite y la misma validación que `/api/logs/batch`, y responde como OTLP: `200 {}`, o `partialSuccess` con lo descartado.
  - **Mapeo:** `service.name` es el servicio y `service.namespace` la aplicación; `deployment.environment(.name)` da el entorno; `service.version` la release y `host.name` el host. `severityNumber` da el nivel, y `trace_id`/`span_id` (en hexadecimal o base64) la traza. `exception.*` va a los campos de error y el resto de atributos a `metadata`.
  - **Solo JSON.** Protobuf pediría una dependencia nueva. Envían JSON directamente el SDK de JavaScript y el OTel Collector (`otlphttp` con `encoding: json`). Los SDK de Python, Java, .NET y Go exportan protobuf: se conectan a través de un Collector.
  - ⚠ **Requiere acción** en el despliegue con Caddy: `deploy/Caddyfile` enruta ahora también `/v1/*` a la API.
- **Alertas — Canal PagerDuty** (Events API v2). Cada aviso abre un incidente, y la recuperación de una regla continua lo resuelve con la misma `dedup_key`: por regla o, para un fallo nuevo o una regresión de un solo fallo, por regla y huella. Los resúmenes programados van como *change events*, que no abren incidente. La routing key se valida y se devuelve enmascarada. ⚠ **Requiere acción:** migración `0019_pagerduty_channel`, que solo añade un valor al enum `AlertChannelType`.
- **MCP — Tres herramientas más** (12 en total):
  - `list_traces`: operaciones recientes;
  - `get_failure_occurrences`: veces, entornos y probabilidad de repetirse;
  - `get_error_group`: estado, regresiones, releases, plantilla y último log de un fallo.
  - Las instrucciones del servidor dicen cuándo usar cada una.
- **Prometheus — Métricas del propio servicio:**
  - `mclog_alert_evaluations_total{rule_type,outcome}`;
  - `mclog_alert_deliveries_total{channel_type,kind,result}` (avisos, recuperaciones y resúmenes);
  - `mclog_scheduler_job_duration_seconds{job,outcome}`;
  - `mclog_ingest_lag_seconds`: retraso entre el `timestamp` del log y su llegada, solo con timestamp propio;
  - `mclog_logs_rejected_total{reason}`: `validation`, `scope`, `batch_too_large` u `otlp_malformed`.
- **Dashboard — Instalable como aplicación (PWA)** con Serwist 9.5.13: manifest (`/manifest.webmanifest`), iconos generados (`/pwa-icon/192`, `/512` y `/maskable`) y una página sin conexión (`/~offline`). El service worker solo guarda en caché los recursos estáticos con hash (`/_next/static/`) y los iconos. La API, las páginas y los datos van siempre a la red: nunca se ven logs viejos ni quedan datos de un espacio en el dispositivo. En `npm run dev` está desactivado.
- **Dashboard — Actualización automática configurable** en la barra superior de Logs, Errores y Operaciones: apagada, 15 s, 30 s, 1 min (lo de antes) o 5 min. Se recuerda en el navegador, se pausa con la pestaña oculta y refresca al volver. Errores también se refresca ahora con rangos relativos.
- **Dashboard — Atajos de teclado:** `g` y luego `l`, `e`, `t`, `r` o `a` llevan a Logs, Errores, Operaciones, Reportes o Alertas, y `?` abre la ayuda con todos los atajos. No actúan mientras se escribe ni con un diálogo abierto. Los enlaces del menú los anuncian con `aria-keyshortcuts`.
- **Dashboard — Copiar enlace** en el detalle del log (`/logs?log=<id>`), y **Reporte de este fallo** en cada fila de Errores: abre Reportes con la huella como filtro y lo genera.
- **Dashboard — Notificaciones de errores en vivo** (opcionales). Con **En vivo** activo, la campana pide permiso al navegador y avisa de los errores que llegan mientras la pestaña está en segundo plano. Envía como mucho un aviso cada 30 s, con el total acumulado.
- **Ciclo de vida de los fallos.** Tabla `ErrorGroup` (una fila por huella y espacio, migración `0018_monitoring` con backfill desde `Log`) que la ingesta mantiene en la misma transacción: primera vez de verdad (más allá de la retención), última, total, nivel más grave, primera y última release. Estados `active`, `resolved` e `ignored` (hasta una fecha o siempre); un resuelto que recibe una ocurrencia posterior a la resolución vuelve a activo y cuenta una **regresión**. API: `PATCH /api/logs/errors/groups` (solo el dueño) y `status`, `sort` y `series` en `GET /api/logs/errors/groups`, que además devuelve `lifecycle` (nuevos, regresiones, resueltos y MTTR de la ventana).
- **Dashboard — Errores con estados:** pestañas Todos / Activos / Regresiones / Resueltos / Ignorados, etiquetas **Nuevo**, **Regresión**, **Resuelto**, **Ignorado** y la última release, mini-gráfica por fallo, primera vez de verdad y total, búsqueda, filtro de servicio, orden, acciones en bloque para el dueño (resolver, ignorar 24 h / 7 días / siempre, reactivar) y cuatro cifras del ciclo de vida, MTTR incluido.
- **Alertas — Cuatro tipos nuevos:** `regression`, `error_rate` (porcentaje con `minVolume`), `silence` (latido: algo que emitía deja de hacerlo) y `spike` (N veces la media de la semana anterior). Las de condición continua tienen estado (`firing`/`ok`) y avisan de la **recuperación** (`AlertEvent.kind = resolve`). Silenciar una regla hasta una fecha (`mutedUntil`), un reintento por envío fallido y un cerrojo de PostgreSQL para que, con varias instancias, solo una evalúe cada pasada. En el panel: selector de tipo, servicio, volumen mínimo, estado **Disparada**, silenciar 1 h / 24 h, y el historial distingue disparos y recuperaciones y enlaza los logs de muestra.
- **Alertas — Resúmenes programados** (pestaña **Resúmenes**): diario o semanal, a una hora UTC, por email, Telegram o webhook (con el formato de Slack, Discord o Teams), con registros, errores, fallos nuevos, regresiones, resueltos, MTTR y los fallos principales. **Enviar ahora** lo prueba. API: `/api/alerts/digests`.
- **API — Latencia y releases:** campo `release` en `Log`; `GET /api/logs/latency` (p50, p95, p99 y máximo por servicio con `durationMs`) y `GET /api/logs/releases` (volumen, errores y fallos estrenados por release).
- **Dashboard — Resumen de Logs:** cada tarjeta compara con el periodo anterior de la misma duración (rojo si los errores suben), tarjeta de **Latencia** si hay `durationMs` y líneas discontinuas en la gráfica donde apareció cada release.
- **Dashboard — Vistas guardadas** en Logs, Registros, Errores y Operaciones: personales (en el navegador) o del espacio (las crea el dueño, `/api/views`).
- **Dashboard — Enlace directo a un log:** `/logs?log=<id>` abre su detalle.
- **Reportes:** secciones opcionales **Ciclo de vida** (con los fallos que volvieron), **Latencia** y **Releases**, también en los formatos para IA, y un gráfico de actividad en SVG en el PDF.
- **Dashboard — Traza legible.** La pantalla de traza (y el panel del detalle) resume la operación arriba: estado (correcta, con avisos o falló), duración, servicios, hosts, tiempo hasta el primer error, mayor salto y la ruta que siguió entre servicios. Dos vistas: **Cronológica**, con los pasos anidados por tramo, las repeticiones seguidas plegadas («×N iguales») y el primer error y el mayor salto marcados, y **Por servicio**, un carril por servicio sobre el mismo eje. Filtro por nivel, servicio y texto, **Ir al primer error**, y cada paso se abre en el detalle del log con ←/→. Si la traza viene recortada, una fila marca el hueco. Un ⓘ explica traza, tramo y huella. La lógica está en `common/trace/model.ts`, con pruebas.
- **Dashboard — Operaciones** (`/traces`): las operaciones del rango con sus servicios, registros, errores, duración y estado, y **Solo con errores**. API: `GET /api/logs/traces`.
- **API — Tramos:** columnas `parentSpanId` y `durationMs` en `Log` (migración `0017_trace_spans`), validadas en la ingesta y en el middleware de `@multicomputos-srl/mclog/express`. La cabecera W3C **`traceparent`** rellena `traceId` y `spanId` de los logs que no los traen.
- **Dashboard — ¿Por qué se agrupan?** El detalle del log enseña las piezas de su huella (aplicación, servicio, clase, código, primer marco y el mensaje sin datos variables), y Errores la plantilla de cada fallo. API: `grouping` en `GET /api/logs/:id/occurrences` y `messageTemplate` en los grupos de error.
- **Dashboard — Contexto por traza:** las líneas del contexto de la misma operación llevan la etiqueta «misma traza», y **Solo esta traza** deja solo esas. La columna de traza de la tabla abre la operación.
- **NetSuite — Cada ejecución es un tramo:** `lib_mclog.js` manda `spanId` (el `executionId`) y `metadata.elapsedMs`, así que la historia de un documento se lee por ejecuciones. ⚠ **Requiere acción:** portar el cambio a la librería del bundle de Facturación Electrónica.
- **Alertas — Webhook con formato de Slack, Discord y Teams.** El canal webhook gana `format` (`generic`, `slack`, `discord`, `teams`). Sin él se deduce de la URL (`hooks.slack.com`, `discord.com/api/webhooks`, `*.webhook.office.com`, flujos de Power Automate): Slack recibe `text` y bloques, Discord `content` y un embed, y Teams una tarjeta adaptable, con el botón "Ver en el dashboard". Antes se mandaba el JSON del aviso a todos, y Slack, Discord y Teams lo rechazaban aunque la documentación decía que funcionaba. La firma HMAC no cambia. En el panel, selector **Formato** en el canal.
- **API — Serie con intervalo adaptativo.** `GET /api/logs/stats` devuelve `bucketSeconds`: 5 min hasta 6 h de ventana, 15 min hasta 48 h, 1 h hasta 31 días y 1 día por encima (`DATE_BIN`, alineado en UTC). `bucket=5m|15m|1h|1d` lo fija a mano. Los snapshots de Logs lo guardan; los anteriores siguen siendo por hora. `get_stats` de MCP sigue por hora.
- **API — Inventario con ventana explícita.** `GET /api/logs/applications` acepta `from`/`to` y devuelve `errors`, los errores de esa ventana, además de `errorsLast24h`.
- **API — Cabecera `x-trace-id` documentada:** vale para todos los logs de la petición que no traigan su propio `traceId`.
- **Dashboard — Intervalos parciales.** El primer intervalo de la gráfica (si el rango empieza a mitad) y el que está en curso salen atenuados y marcados como parciales, y no entran en la tendencia de las tarjetas.
- **Reportes — "Fallos que mejoraron"** en la comparación con el periodo anterior (y `improved_failures` en los formatos para IA).
- **NetSuite — `lib_mclog.js`, librería central descargable.** Lee la URL, la API key, la aplicación y el ambiente de un registro personalizado (`customrecord_mclog_config`), con 5 minutos de caché en `N/cache`. Acumula los logs y envía un solo lote al terminar cada punto de entrada. `wrapEntryPoints` pone el contexto (registro y traceId `<tipo>:<id>` en User Events, clave en Map/Reduce, método en Suitelets) y registra las excepciones no controladas sin duplicar las que ya se registraron a mano. Rechaza URL `http://`, oculta credenciales en la metadata y respeta la governance. Incluye 114 pruebas sin dependencias (`test_lib_mclog.js`), que corren en CI.
- **Sitio:** guía "Integrar NetSuite con lib_mclog.js", con enlaces de descarga, creación del registro, ejemplos por tipo de script y solución de problemas.
- **NetSuite — recetario para consultores.** Siete scripts completos sobre `lib_mclog.js` en `integrations/netsuite/examples/`: enviar una factura a un proveedor (User Event), recibir pedidos de un e-commerce (RESTlet), reglas que bloquean un pedido (User Event), ruta de aprobación (Workflow Action), recordatorios de facturas vencidas (Scheduled), importación de clientes desde CSV (Map/Reduce) y errores de formularios (Client Script). Guía "NetSuite para consultores: recetario de logs" en el sitio, con la instalación paso a paso y cinco reglas para registrar bien. El skill de IA `mclog` los enlaza (§4.1): el agente parte del ejemplo que encaja, usa el proxy en Client Scripts y reconoce el `404` de una URL base que termina en `/mcp`.
- **NetSuite — `lib_mclog_browser.js`.** Logs desde Client Scripts a través de un Suitelet proxy (`examples/sl_mclog_browser_proxy.js`), sin que la API key llegue al navegador. El proxy exige la cabecera `X-MCLog-Client`, acota tamaño, número y nivel de los logs, y marca su origen. `test_examples.js` prueba las siete recetas y la librería del navegador (123 comprobaciones), y corre en CI.
- **Skill de IA `mclog`** (`docs/skills/mclog/SKILL.md`). En un solo `.md` enseña a un asistente a:
  - desplegar MCLog: VPS con Compose + Caddy, CapRover + Railway o local;
  - preparar espacios y claves;
  - integrar NetSuite (`lib_mclog.js`), Node.js y sistemas custom por HTTP, con contrato, especificación de adaptador y ejemplos en Python, C#, PHP, Java, Go y PowerShell;
  - conectar MCP, Prometheus y webhooks, y verificar y resolver problemas.

  Se distribuye por:
  - **MCP**: recurso `mclog://skill/SKILL.md`, prompt `install_skill` (slash command en Claude Code) y herramienta `get_integration_skill`. Las `instructions` del servidor lo anuncian al conectar;
  - **API**: `GET /api/skill`, pública, como descarga `mclog-SKILL.md`;
  - **Dashboard**: panel "Conectar una IA" en **Espacio → API keys**;
  - **Sitio**: página `/docs/skill-ia` con botón "Descargar .md".
- **API:** copia del skill en `Back_MCLog/skill/`, que la imagen Docker incluye. Se regenera con `npm run sync:skill`, y la CI y un test fallan si difiere de `docs/`.

- **Dashboard — Rango rápido "Últimos 5 minutos"** en Logs y Registros, para seguir de cerca un despliegue o un incidente. Viaja en la URL como `range=5m`.
- **Dashboard — Informe en PDF** en Reportes. El informe para personas se descarga en Markdown o en PDF: el mismo documento maquetado para papel, con la cabecera de MCLog, el nombre y el número de página al pie, tablas que no se parten entre filas y stacks que no se cortan en el margen. Se imprime en un iframe oculto con el motor del navegador ("Guardar como PDF"), sin dependencias nuevas, siempre en claro y en el idioma del reporte; los enlaces a las ocurrencias siguen activos.
- **Dashboard — Configuración de Reportes más compacta.** Los tres tipos pasan a mosaicos en fila (**Informe**, **Brief IA**, **Datos IA**) con sus formatos de descarga y la descripción del elegido debajo; las secciones son pastillas; el idioma entra en **Opciones**. La vista previa queda fija y a toda la altura junto al panel, y en 4K el panel se ensancha a dos columnas. `Checkbox` gana la variante `chip`.
- **Dashboard — Modo presentación** en Logs, Registros, Errores, Traza, Reportes y Snapshots. Un botón en la barra superior pone la vista a pantalla completa (Fullscreen API sobre `<html>`, para que menús y diálogos sigan visibles) y oculta la barra lateral y la superior. Se sale con Esc o con el botón flotante; el foco pasa al botón que sustituye al pulsado. Si el navegador no concede la pantalla completa, se ocultan igualmente las barras. `DashboardLayout` gana la prop `presentable` y la variable CSS `--sticky-top` para los paneles fijos.

- **Dashboard — Panel "Conectar una IA"** en **Espacio → API keys**, solo para el dueño del espacio. Muestra:
  - el estado del MCP en la plataforma (`GET /api/settings/public`);
  - la URL del endpoint `/mcp`;
  - la configuración lista para copiar de Claude Code, Cursor, VS Code y Claude Desktop, con un marcador en lugar de la clave (el panel nunca vuelve a mostrar una);
  - el comando `/mcp__mclog__install_skill` y la descarga del skill.

  Si la cuenta root ha apagado el MCP, no ofrece la conexión y lo explica; a la root le da un acceso directo para activarlo.

- **Inventario de claves de la plataforma** (**Plataforma → Inventario de claves**, admin de plataforma):
  - todas las API keys de todos los espacios, con su espacio, su creador, su estado, su último uso general y por IA, y sus avisos (`read-unrestricted`, `stale`, `never-used`, `expiring-soon`, `ingest-unrestricted`, `read-no-expiry`);
  - resumen, filtros por vista, permiso, espacio y búsqueda, y orden por gravedad;
  - revocar cualquier clave, y abrir el espacio de cada una.

  API: `GET /api/admin/keys` y `DELETE /api/admin/keys/:id`. La clave heredada `API_KEY` no aparece, pero una nota indica si está activa.
- **API — Último uso por MCP:** columna `lastMcpUsedAt` en `ApiKey` (migración `0016_api_key_last_mcp_use`), con el mismo throttling de 5 minutos que `lastUsedAt`. La tabla de claves del espacio la muestra como "IA (MCP)" bajo **Último uso**.
- **Dashboard — Configuración:** bajo **Acceso para IA (MCP)**, cuántas claves lo han usado en los últimos 30 días. Si se apaga sin guardar, avisa de que esos asistentes se cortarán.
- **API — `GET /api/logs/:id/occurrences`:** cuántas veces ha ocurrido el fallo de un log (su huella) en 24 h, en 7 días y en lo que conserva la retención, con primera y última vez, en total y por entorno. Respeta el alcance de las claves acotadas. Con los últimos 7 días añade:
  - `recurrence`: probabilidad de que se repita en la próxima hora y en 24 h. Se calcula con las horas en que ocurrió sobre las horas observadas desde el primer log de la aplicación, con la regla de sucesión de Laplace.
  - `failureRate`: la parte de las operaciones (traceId distintos) de la misma aplicación, servicio y entorno que acabó en el fallo.
- **Dashboard — Ocurrencias en el detalle del log:** nueva sección con esas cifras y el desglose por entorno. La tercera cifra se llama **Total**: antes llevaba el nombre de la retención ("3 meses") y confundía cuando el fallo tenía horas. Debajo, **Probabilidad**: próxima hora, próximas 24 h y por operación, con la base de cada cifra y un aviso si hay pocos datos. "Copiar para IA" incluye todo, con reglas que aclaran que el total solo abarca la retención y que las probabilidades son estimaciones.
- **API — Correo por Microsoft Graph:** `MAIL_TRANSPORT=graph` envía las alertas, las invitaciones y "olvidé mi contraseña" por HTTPS con una app de Microsoft Entra ID (`MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`), desde el buzón de `SMTP_FROM`. Resuelve dos cosas:
  - los servidores que no pueden salir por SMTP, como los Droplets de DigitalOcean, que bloquean los puertos 25, 465 y 587;
  - el fin del SMTP AUTH con contraseña en Microsoft 365, que se desactiva por defecto a finales de 2026.

  El mensaje sigue siendo el mismo MIME, con parte de texto y parte HTML. El token se reutiliza hasta poco antes de caducar. Los fallos citan el error de Microsoft (`AADSTS…`, `ErrorAccessDenied`) sin exponer el secreto. Sin la variable todo sigue igual: `smtp` es el valor por defecto. Guía, con el permiso limitado a un solo buzón, en [DEPLOYMENT.md → Configurar el correo saliente](docs/DEPLOYMENT.md#configurar-el-correo-saliente).
- **Dashboard — Varios niveles a la vez** en el filtro de Logs y Registros. La lista lleva una casilla por nivel y sigue abierta al marcar; **Todos los niveles** quita la selección. En la URL va como lista (`?level=error,warn`), y los enlaces con un solo nivel siguen valiendo. El stream en vivo, la exportación y los snapshots respetan la selección. El `Select` del dashboard gana el modo `multiple`.
- **Dashboard — Más filtros en Reportes:** servicio, host, clase y código de error, texto y huella de un fallo, además de aplicación y entorno. Acotan todas las secciones a la vez (cifras, actividad, comparación, fallos e inventario) y viajan en la URL. El reporte los lista en su ámbito; en los formatos para IA van como `scope_*`, con una regla que pide aplicarlos al seguir investigando, y el texto y el host pasan por el enmascarado. "Exportar → Reporte" desde Logs arrastra también la búsqueda y la huella.
- **API — Mismos filtros en estadísticas, grupos de error e inventario:** `GET /api/logs/stats`, `/api/logs/errors/groups` y `/api/logs/applications` aceptan todos los filtros de `GET /api/logs` (`service`, `host`, `search`, `message`, `errorName`, `errorCode`, `fingerprint`, `traceId`, `level`…). La serie por hora y el inventario los aplican con `buildWhereSql`, que replica `buildWhere` en SQL.

### Cambiado
- **Dashboard — Accesibilidad (WCAG 2.1 AA):**
  - **Tabla de logs:** es una sola parada de Tab (tabindex itinerante, con ↑/↓/Inicio/Fin) con anillo de foco visible. La fila abierta lleva `aria-current` en lugar de `aria-selected`. Las cabeceras ordenables llevan `aria-sort`: un clic ordena por esa columna y otro invierte el orden.
  - **Gráfica de actividad:** es un `slider` sobre los intervalos. ←/→ (e Inicio/Fin) los recorren y el lector anuncia el desglose; Mayús + flechas amplía una selección e Intro la aplica al rango.
  - **Avisos:** se pausan con el ratón o el foco encima y se cierran con su botón o con Esc. Los de error no desaparecen solos y cada aviso se anuncia una sola vez.
  - **Menú lateral en móvil:** cerrado es `inert`, fuera del Tab y del lector. Abierto, el foco entra, no sale con Tab y Esc lo cierra.
  - **Selector de rango de fechas:** al abrirse, el foco entra en el panel (antes estaba montado al final del documento y con Tab no se llegaba a él), y se cierra si el foco sale.
  - **Reportes:** los tipos de informe son un grupo de radios que se recorre con flechas, y la vista previa es el panel (`tabpanel`) de las pestañas Vista y Fuente.
  - **Modo en vivo:** una región viva anuncia el estado de la conexión y, en cada refresco, cuántos logs y errores llegaron.
  - **Detalle del log:** ←/→ ya no cambian de log dentro de un bloque de código desplazable, y Esc se atiende una sola vez.
  - **Varios:** los puntos de nivel dicen el nivel al lector; las opciones de menús y desplegables tienen foco visible; los `aria-label` están traducidos.
- **Prometheus — `application` acotada:** las primeras 200 aplicaciones distintas conservan su etiqueta en `mclog_logs_ingested_total`; las demás se suman en `__other__`. Un emisor que inventara nombres creaba antes una serie por nombre, sin límite.
- **Dashboard — Canal PagerDuty** en **Espacio → Alertas → Canales**, con su integration key.
- **Dashboard — ESLint del proyecto** (`frontend_mclog/.eslintrc.cjs`): `next/core-web-vitals` más `jsx-a11y/recommended`, con cada ajuste justificado en el propio archivo. Lo aplican `npm run lint` y `next build`.
- **Dashboard — `next.config.mjs`** sustituye a `next.config.js`, porque Serwist es un módulo ES. La imagen Docker copia ahora `public/`, donde se genera `sw.js`.
- **Alertas — `new_error_group`** ya no agrega todo lo retenido en cada pasada: solo mira las huellas con algún log en la ventana. ⚠ **Requiere acción:** aplicar la migración `0018_monitoring` (con varias tablas nuevas y el relleno de `ErrorGroup`, que en una tabla `Log` grande tarda) antes de arrancar la API nueva.
- **MCP — `get_trace`** devuelve también `parentSpanId` y `durationMs` de cada paso.
- **API — Las estadísticas siguen la ventana.** Con `from`/`to`, `total`, `byLevel`, `byApplication` y `byEnvironment` de `GET /api/logs/stats` son los de esa ventana; solo con `hours` siguen siendo de toda la retención. `last24h` cuenta las 24 h anteriores a `to`. `to` anterior a `from` responde `400` en el listado, las estadísticas, los grupos de error y el inventario. ⚠ **Requiere acción** para quien consuma la API con `from`/`to` y esperara totales históricos.
- **API — MCLog ya no inventa un `traceId`.** Solo se guarda el que manda la aplicación, en el log o en la cabecera `x-trace-id`. Antes se generaba uno por petición: cada log suelto era una "traza" de un registro, todo un lote sin traceId compartía la misma y la tasa por operación contaba peticiones. Ahora, sin traceId el log no ofrece "Ver traza" y la tasa por operación dice que el servicio no envía trazas. Los logs ya guardados no cambian. ⚠ **Requiere acción** si alguna integración contaba con el traceId generado.
- **API — Probabilidad de repetición más honesta.** Se calcula en la misma aplicación, servicio y entorno que el log (antes mezclaba entornos). La próxima hora sigue usando las horas de 7 días; las próximas 24 h usan los días de los últimos 30 (`activeDays`/`observedDays`), en lugar de suponer 24 horas independientes, que daba casi un 100 % a un error que llevaba una semana callado. La hora o el día en curso solo cuentan si ya tuvieron el fallo.
- **API — Huella:** un número de 8 cifras o más ya no se toma por un hash (`<hex>`): "registro 9999999" y "registro 10000000" son el mismo fallo. ⚠ **Requiere acción:** los fallos cuyo mensaje lleva números de 8 cifras o más cambian de huella una vez; tras desplegar pueden salir como "error nuevo".
- **API — Traza larga:** con más de 1000 registros, `GET /api/logs/trace/:traceId` devuelve los 500 primeros y los 500 últimos, con `total`, `truncated` y `omitted`; antes cortaba por el final y perdía justo los más recientes, sin decirlo. El orden desempata por `id`. `get_trace` de MCP lo avisa y añade `host` y `spanId`.
- **API — Fecha futura en la ingesta:** un `timestamp` más de 5 min en el futuro se trae a la hora de llegada y el original queda en `metadata.mclogClockSkew`.
- **Alertas — Lo que cuentan y adónde llevan.** La ventana acaba en el momento de la evaluación (un log con fecha futura ya no dispara la regla una y otra vez). `new_error_group` cuenta todos los grupos nuevos (antes, con un tope de 50, un umbral mayor no disparaba nunca) y, si el cooldown es más largo que la ventana, avisa de lo que apareció mientras callaba. El enlace reproduce la ventana, los niveles (el de la regla y los más graves), el servicio y, con un solo fallo nuevo, su huella. Las muestras llevan `fingerprint` y `traceId`, y el título dice "1 error nuevo" o "N errores nuevos".
- **API — Grupos de error:** `limit` admite hasta 200. El ejemplo de cada grupo cumple los mismos filtros que el conteo (ventana, nivel y alcance de la API key); antes podía ser posterior a la ventana o de una aplicación que la clave no veía.
- **Dashboard — Resumen con las cifras del rango.** Las tarjetas salen de los totales de la API, y "Por entorno", "Aplicaciones más activas" y la tarjeta **Aplicaciones** siguen el rango (antes eran históricos). En "Todo el histórico", los fallos y las aplicaciones son de los últimos 31 días, y lo dicen. "100+" solo aparece si hay más de 100 fallos (también en Errores, snapshots y reportes).
- **Dashboard — Tabla y resumen miran la misma ventana,** cerrada en el instante de referencia, que avanza cada minuto en la primera página (y al volver a la pestaña). Antes el resumen se refrescaba con el mismo inicio y "últimas 24 h" se iba alargando.
- **Dashboard — Textos:** "Ver N trazas" pasa a "Ver traza (N registros)"; la ayuda de "Fallos distintos" describe la huella completa; la de traceId explica cuándo existe; "primera" en Errores pasa a "primera en el rango".
- **Dashboard — Atrás deshace un filtro:** cada filtro elegido es una entrada del historial (la búsqueda libre no, para no llenarlo mientras se teclea). "Volver" de la traza vuelve a donde se estaba, y el aviso de huella vuelve a Errores con el mismo rango.
- **Reportes:** los totales salen de la API; los errores por aplicación, del inventario de la ventana (incluyen los que no tienen huella). `bucket_hours` puede ser fraccionario (0,25 = 15 min).
- **API — `level` admite varios niveles** separados por comas (`level=error,warn`) en `GET /api/logs`, `/stats`, `/errors/groups`, `/applications`, el stream en vivo y los filtros de los snapshots. Un nivel desconocido en la lista responde `400`; el stream ahora también valida `level` y `environment`. ⚠ **Requiere acción:** desplegar la API antes que el dashboard; un dashboard nuevo contra una API anterior recibe `400` al elegir más de un nivel.
- **Correos — Plantilla nueva:** las invitaciones, el aviso de acceso a un espacio, "olvidé mi contraseña" y las alertas comparten un diseño con cabecera de marca, título, botón, enlace de respaldo y un pie que explica por qué llega el correo. La plantilla admite Outlook y móviles, y cada correo sale también en texto plano. El correo de alertas presenta los datos en una tabla y las muestras en un bloque monoespaciado (`Back_MCLog/src/utils/emailTemplate.ts`).
- **Dashboard — Traza y fallos iguales dentro del detalle del log:** "Ver traza" pasa a "Ver N trazas", con el número de registros de la traza, y junto con "Fallos iguales" se abre en la columna izquierda del mismo diálogo en lugar de llevar a otra página. La traza resalta el log desde el que se abrió y ofrece "Abrir en pestaña nueva"; "Fallos iguales" lista las 50 ocurrencias más recientes, que se abren con un clic, y conserva "Filtrar la tabla".
- **MCP:** `tools/list` devuelve 9 herramientas (se añade `get_integration_skill`) y el servidor declara capacidades de recursos y prompts.
- **Dashboard — "Copiar para IA" más preciso:**
  - **Log:** el contexto ya no repite el propio log y lleva la columna `error_name`. Si no había registros cerca, o si el contexto no había cargado al copiar, el brief lo dice (en el segundo caso, con la llamada `get_log_context` que lo resuelve).
  - **Log y traza:** si el stack se recorta, se indica con `stack_lines_omitted`. Cuando hay stack, se añade una regla para no inventar el origen de frames minificados.
  - **Fallo agrupado:** tiene su propio título y objetivo (antes usaba los del log), lleva la ventana (`window_from`/`window_to`) y no repite el mensaje cuando va el ejemplo completo.
  - **Traza:** la cronología lleva `error_name` y los errores dicen cuántos se muestran del total (`10/23`).
  - La regla de `first_seen_in_window` solo aparece donde existe ese campo (reporte y fallo agrupado).

### Corregido
- **Dashboard — Modo en vivo:** la tabla volvía a refrescarse solo si pasaban 15 s sin logs (el temporizador se reiniciaba con cada uno), y anteponía filas que no cumplían la búsqueda o la huella. El stream filtra ahora también por `search` y `fingerprint`, y el modo en vivo se apaga con un filtro de la búsqueda avanzada.
- **Dashboard — Logs aplica los filtros avanzados que llegan en la URL** (desde Registros o desde el enlace de una alerta), y **Limpiar** también los quita.
- **Dashboard — Gráfica en rangos largos:** a partir de 62 días se perdían los días más recientes y los totales salían cortos.
- **Dashboard — Duraciones:** el redondeo arrastra a la unidad mayor ("1 min 60 s" pasa a "2 min").
- **API — Inventario:** los errores de 24 h usaban el reloj de la base de datos, y con una zona horaria distinta de UTC salían desplazados.
- **API — Prometheus:** un lote del que se descartaba alguna fila no sumaba nada a `mclog_logs_ingested_total`.
- **Dashboard — `Fieldset` ya no desborda su columna** con un texto largo en una línea (el botón "Más filtros" de Reportes se salía del panel): un `<fieldset>` mide por defecto al menos lo que su contenido sin partir.
- **Correos:** la caducidad de la invitación decía "1 días" ("1 days" en inglés), y la alerta de errores nuevos decía "error(es) nuevo(s)". Ahora usan singular y plural según el número.
- **API — Contexto de un log:** con más registros que `limit` en la ventana, devolvía los más antiguos y el log, y lo que lo precedía, podían quedar fuera. Ahora va en dos consultas desde el log hacia atrás y hacia delante (la mitad mayor para lo anterior) y se acota también por entorno.
- **Enmascarado:** el id de una Server Action de Next.js y los hashes de commit ya no salen como `[REDACTED:key]`. Son públicos y hacen falta para diagnosticar el fallo.

### Seguridad
- **Dependencias:**
  - Se aplicó `npm audit fix` en la API y en el dashboard (entre otros, Prisma 7.10.1).
  - El dashboard fija `zod` en 4.6.7 con `overrides`: la versión que traía Serwist tenía un aviso alto (GHSA-mrhx-c7xc-m3w5).
  - Quedan avisos que exigen saltos de versión mayor, que se tratarán aparte: Next.js 14 (crítico, se corrige en la 15.5.28 o posterior), `eslint-config-next`/`glob`/`postcss`, `nodemailer` 10, `vitest` 5 (solo en desarrollo) y `uuid` 14.

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
