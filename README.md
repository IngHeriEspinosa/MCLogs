# MCLog — Servicio Centralizado de Logs

Plataforma para capturar, consultar y gestionar los logs de **todas tus aplicaciones y scripts** (NetSuite/SuiteScript, servicios Node.js, Python, o cualquier sistema que pueda hacer una petición HTTP) desde un único lugar.

## Componentes

| Carpeta | Qué es | Stack |
|---|---|---|
| [`Back_MCLog/`](Back_MCLog/) | API REST de ingesta y consulta de logs | Node.js · Express · TypeScript · Prisma · PostgreSQL |
| [`frontend_mclog/`](frontend_mclog/) | Dashboard web de monitoreo | Next.js 14 (App Router) · React Query · Tailwind |
| [`packages/mclog/`](packages/mclog/) | Librería npm `@multicomputos-srl/mclog` para apps Node.js | TypeScript · sin dependencias runtime |
| [`integrations/netsuite/`](integrations/netsuite/) | Librería SuiteScript 2.1 + ejemplos para NetSuite | SuiteScript 2.1 |
| [`site/`](site/) | Landing y documentación pública ([sitio](https://ingheriespinosa.github.io/MCLogs)) | Next.js 14 (static export) · GitHub Pages |
| [`docs/`](docs/) | Documentación completa del proyecto | — |

## Qué hace

Desglose completo en [docs/FEATURES.md](docs/FEATURES.md). En resumen:

- **Ingesta** individual y por lotes (hasta 500 por petición), con captura de excepciones (clase, código y stack).
- **Agrupación de errores** por huella: las repeticiones del mismo fallo son un grupo con su conteo, no N líneas sueltas.
- **Acceso para IA** por MCP en `/mcp`: Claude Code, Cursor o Claude Desktop investigan los logs con ocho herramientas propias.
- **Consulta** con filtros combinables (nivel, entorno, aplicación, servicio, host, traceId, huella, fechas, búsqueda libre) y **búsqueda avanzada** por campo (mensaje, nombre y código del error) en la vista **Registros**.
- **Traza y contexto**: una operación completa por `traceId` y lo ocurrido alrededor de cualquier log.
- **Estadísticas** en vivo, con serie por hora y nivel para ver cuándo empezó un incidente.
- **Exportación** CSV y NDJSON respetando los filtros activos.
- **Snapshots compartibles**: una copia congelada de Logs, Registros, Errores o una Traza con su enlace, para el equipo o pública (sin cuenta y con los datos sensibles enmascarados), con caducidad y recuento de visitas. Al pegar el enlace en Slack, WhatsApp o Teams sale una vista previa con el título y las cifras.
- **API keys con permisos** (`ingest` / `read` / `metrics`), acotables por aplicación, caducables y revocables.
- **Usuarios y roles** administrables desde el dashboard, con cuenta root protegida, cambio de contraseña y cierre de sesiones.
- **Verificación en dos pasos** (TOTP con códigos de recuperación) y borrado de la propia cuenta.
- **Lab**: escenarios de prueba que envían logs reales para ver cada pantalla en acción, y un compositor que muestra la petición en JSON y cURL.
- **Alertas** por webhook firmado, correo y Telegram, con reglas de umbral o de error nuevo y silencio configurable.
- **Logs en vivo** en el dashboard por Server-Sent Events.
- **Retención automática** configurable entre 3 meses y 5 años, más purga puntual por fecha y aplicación.
- **Sesiones** con JWT, refresh rotativo y renovación transparente.
- **Despliegue** en un VPS con Docker Compose y Caddy (HTTPS automático y copias de seguridad diarias), o repartido entre CapRover (API y base de datos) y Railway (dashboard).
- **Observabilidad** del propio servicio: `/health`, `/metrics` Prometheus y logging estructurado.

## Inicio rápido (desarrollo local)

Requisitos: Node.js 20+, Docker Desktop.

```bash
# 1. Base de datos (PostgreSQL en el puerto 5435 del host)
cd Back_MCLog
docker compose up -d db

# 2. Backend (puerto 3000)
npm install
cp .env.example .env          # revisa los valores; para local ya funcionan
npx prisma migrate deploy
npm run dev                   # o: npm run build && npm start

# 3. Frontend (puerto 3001)
cd ../frontend_mclog
npm install
npm run dev
```

Abre **http://localhost:3001**: la primera pantalla es el acceso. Entra con el usuario admin definido en `Back_MCLog/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, por defecto `admin@example.com` / `ChangeMe123!`). Es la cuenta root: no se puede borrar ni degradar.

> **Paso a paso:** la guía [Primeros pasos](docs/guias/primeros-pasos.md) recorre esta instalación con comprobaciones en cada paso, hasta ver tu primer log en el dashboard.

> Nota: en desarrollo local el backend corre fuera de Docker y `.env` apunta a `localhost:5435`. Dentro de `docker compose up api` el contenedor usa su propia URL interna (`db:5432`), definida en `docker-compose.yml`.

### Enviar tu primer log

```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-key" \
  -d '{
    "application": "mi-app",
    "level": "info",
    "environment": "development",
    "message": "Hola MCLog",
    "metadata": { "userId": 42 }
  }'
```

`dev-key` es la clave heredada del `.env` de desarrollo y solo sirve en local. Para cualquier otra cosa, crea una clave con permiso `ingest` en **Espacio → API keys**. Sin escribir código, **Espacio → Lab** envía escenarios de prueba completos.

## Conectar una IA a tus logs

Crea una API key con permiso `read` en el dashboard (**Espacio → API keys**) y registra el servidor MCP:

```bash
claude mcp add --transport http mclog https://mclog.tu-dominio.com/mcp   --header "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
```

A partir de ahí puedes preguntar «¿qué está fallando en producción hoy?» y el asistente lo averigua solo: agrupa las repeticiones, sigue la traza entre sistemas y mira qué pasó justo antes del error. Configuración para Cursor, VS Code y Claude Desktop en [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## Cómo integrar tus aplicaciones

- **Cualquier lenguaje (API REST)** → [docs/INTEGRATION.md](docs/INTEGRATION.md) — ejemplos con curl, Node.js y Python.
- **NetSuite / SuiteScript** → [integrations/netsuite/README.md](integrations/netsuite/README.md) — librería lista para subir al File Cabinet.
- **Apps Node.js** → [packages/mclog/README.md](packages/mclog/README.md) — cliente tipado `@multicomputos-srl/mclog`, sin dependencias.

La ingesta se autentica con el header **`x-api-key`** y una clave con permiso `ingest`, creada en **Espacio → API keys**. No se necesitan usuarios ni JWT para enviar logs. La variable `API_KEY` del backend es una clave heredada y deprecada: no la uses para integraciones nuevas.

## Documentación

Índice completo en [docs/README.md](docs/README.md). Publicada también en web: **<https://ingheriespinosa.github.io/MCLogs/docs>**.

| Documento | Contenido |
|---|---|
| [docs/guias/](docs/README.md#guías-paso-a-paso) | **Guías paso a paso**: instalar, integrar, investigar, proteger tu cuenta, desplegar |
| [docs/FEATURES.md](docs/FEATURES.md) | Desglose de todas las funcionalidades |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Documentación técnica del sistema (API, datos, seguridad, despliegue) |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Manual de usuario: consultar, enviar logs y administrar |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, decisiones de diseño y escalabilidad |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Despliegue en producción: VPS con Docker Compose y Caddy, o CapRover + Railway |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Guía de integración REST para cualquier aplicación |
| [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md) | Conectar Claude Code, Cursor o Claude Desktop por MCP |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Glosario de términos |
| [docs/FAQ.md](docs/FAQ.md) | Preguntas frecuentes y errores concretos |
| [CHANGELOG.md](CHANGELOG.md) | Historial de cambios por fecha, con lo que requiere acción al actualizar |
| `http://localhost:3000/docs` | Swagger UI interactivo (OpenAPI 3) |

## Tests

```bash
# Backend — 238 tests en 19 suites (auth, 2FA, claves, usuarios, espacios, configuración, snapshots, compresión, ingesta, huellas, errores, MCP, alertas, tiempo real)
cd Back_MCLog
docker compose up -d db       # requiere la DB en localhost:5435
npm test

# Dashboard — 46 tests (reportes, enmascarado, Markdown, preferencias, errores agrupados y snapshots; runner nativo de Node 24)
cd frontend_mclog
npm test

# Librería — 95 tests
cd packages/mclog
npm test

# Cliente NetSuite — 40 comprobaciones, sin dependencias ni cuenta de NetSuite
node integrations/netsuite/test_mclog_client.js

# Librería central NetSuite (lib_mclog.js) — 114 comprobaciones, sin dependencias
node integrations/netsuite/test_lib_mclog.js
```

## Licencia

MIT. Ver [LICENSE](LICENSE).
