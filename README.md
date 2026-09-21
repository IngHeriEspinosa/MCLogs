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
- **Consulta** con filtros combinables (nivel, entorno, aplicación, servicio, host, traceId, huella, fechas, búsqueda libre).
- **Traza y contexto**: una operación completa por `traceId` y lo ocurrido alrededor de cualquier log.
- **Estadísticas** en vivo, con serie por hora y nivel para ver cuándo empezó un incidente.
- **Exportación** CSV y NDJSON respetando los filtros activos.
- **API keys con permisos** (`ingest` / `read` / `metrics`), acotables por aplicación, caducables y revocables.
- **Usuarios y roles** administrables desde el dashboard, con cambio de contraseña y cierre de sesiones.
- **Alertas** por webhook firmado, correo y Telegram, con reglas de umbral o de error nuevo y silencio configurable.
- **Logs en vivo** en el dashboard por Server-Sent Events.
- **Retención automática** por días, más purga puntual por fecha y aplicación.
- **Sesiones** con JWT, refresh rotativo de un solo uso y renovación transparente.
- **Despliegue** con Docker Compose y Caddy, HTTPS automático y copias de seguridad diarias.
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

Abre **http://localhost:3001** e inicia sesión con el usuario admin definido en `Back_MCLog/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, por defecto `admin@example.com` / `ChangeMe123!`).

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

## Conectar una IA a tus logs

Crea una API key con permiso `read` en el dashboard (Ajustes → API keys) y registra el servidor MCP:

```bash
claude mcp add --transport http mclog https://mclog.tu-dominio.com/mcp   --header "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
```

A partir de ahí puedes preguntar «¿qué está fallando en producción hoy?» y el asistente lo averigua solo: agrupa las repeticiones, sigue la traza entre sistemas y mira qué pasó justo antes del error. Configuración para Cursor, VS Code y Claude Desktop en [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## Cómo integrar tus aplicaciones

- **Cualquier lenguaje (API REST)** → [docs/INTEGRATION.md](docs/INTEGRATION.md) — ejemplos con curl, Node.js, Python y front-end.
- **NetSuite / SuiteScript** → [integrations/netsuite/README.md](integrations/netsuite/README.md) — librería lista para subir al File Cabinet.
- **Apps Node.js** → [packages/mclog/README.md](packages/mclog/README.md) — cliente tipado `@multicomputos-srl/mclog`, sin dependencias.

La ingesta se autentica con el header **`x-api-key`** (variable `API_KEY` del backend). No se necesitan usuarios ni JWT para enviar logs; los usuarios y JWT son solo para el dashboard.

## Documentación

Índice completo en [docs/README.md](docs/README.md).

| Documento | Contenido |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Desglose de todas las funcionalidades |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Documentación técnica del sistema (API, datos, seguridad, despliegue) |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Manual de usuario: consultar, enviar logs y administrar |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, decisiones de diseño y escalabilidad |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Despliegue en producción: VPS, Docker Compose, Caddy, backups |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Guía de integración REST para cualquier aplicación |
| [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md) | Conectar Claude Code, Cursor o Claude Desktop por MCP |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Glosario de términos |
| [docs/FAQ.md](docs/FAQ.md) | Preguntas frecuentes y errores concretos |
| `http://localhost:3000/docs` | Swagger UI interactivo (OpenAPI 3) |

## Tests

```bash
# Backend — 150 tests (auth, claves, usuarios, ingesta, huellas, errores, MCP, alertas, tiempo real)
cd Back_MCLog
docker compose up -d db       # requiere la DB en localhost:5435
npm test

# Librería — 83 tests
cd packages/mclog
npm test

# Cliente NetSuite — 32 comprobaciones, sin dependencias ni cuenta de NetSuite
node integrations/netsuite/test_mclog_client.js
```

## Licencia

MIT. Ver [LICENSE](LICENSE).
