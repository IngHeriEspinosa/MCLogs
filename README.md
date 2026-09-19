# MCLog — Servicio Centralizado de Logs

Plataforma para capturar, consultar y gestionar los logs de **todas tus aplicaciones y scripts** (NetSuite/SuiteScript, servicios Node.js, Python, o cualquier sistema que pueda hacer una petición HTTP) desde un único lugar.

## Componentes

| Carpeta | Qué es | Stack |
|---|---|---|
| [`Back_MCLog/`](Back_MCLog/) | API REST de ingesta y consulta de logs | Node.js · Express · TypeScript · Prisma · PostgreSQL |
| [`frontend_mclog/`](frontend_mclog/) | Dashboard web de monitoreo | Next.js 14 (App Router) · React Query · Tailwind |
| [`Back_MCLog/log-service-lib/`](Back_MCLog/log-service-lib/) | Librería npm `@enviromentmc/mclog` para apps Node.js | TypeScript · sin dependencias runtime |
| [`integrations/netsuite/`](integrations/netsuite/) | Librería SuiteScript 2.1 + ejemplos para NetSuite | SuiteScript 2.1 |
| [`docs/`](docs/) | Documentación completa del proyecto | — |

## Qué hace

Desglose completo en [docs/FEATURES.md](docs/FEATURES.md). En resumen:

- **Ingesta** individual y por lotes (hasta 500 por petición), autenticada con API key.
- **Consulta** con filtros combinables (nivel, entorno, aplicación, servicio, host, traceId, rango de fechas, búsqueda libre), ordenación y paginación.
- **Estadísticas** en vivo: total, últimas 24 h, por nivel, top de aplicaciones y por entorno.
- **Exportación** CSV y NDJSON respetando los filtros activos.
- **Retención** por purga selectiva con fecha y aplicación (solo admin).
- **Sesiones** con JWT, refresh rotativo de un solo uso y renovación transparente.
- **Dashboard** con detalle expandible de metadata y filtros sincronizados con la URL.
- **Observabilidad** del propio servicio: `/health`, `/metrics` Prometheus y logging estructurado.

## Inicio rápido (desarrollo local)

Requisitos: Node.js 20+, Docker Desktop.

```bash
# 1. Base de datos (PostgreSQL en el puerto 5434 del host)
cd Back_MCLog
docker compose up -d db

# 2. Backend (puerto 3000)
npm install
cp .env.example .env          # revisa los valores; para local ya funcionan
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/mclog?schema=public" npx prisma migrate deploy
npm run dev                   # o: npm run build && npm start

# 3. Frontend (puerto 3001)
cd ../frontend_mclog
npm install
npm run dev
```

Abre **http://localhost:3001** e inicia sesión con el usuario admin definido en `Back_MCLog/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, por defecto `admin@example.com` / `ChangeMe123!`).

> Nota: en desarrollo local el backend corre fuera de Docker, por eso `DATABASE_URL` apunta a `localhost:5434`. Dentro de `docker compose up api` la URL usa el host `db` (ya configurado).

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

## Cómo integrar tus aplicaciones

- **Cualquier lenguaje (API REST)** → [docs/INTEGRATION.md](docs/INTEGRATION.md) — ejemplos con curl, Node.js, Python y front-end.
- **NetSuite / SuiteScript** → [integrations/netsuite/README.md](integrations/netsuite/README.md) — librería lista para subir al File Cabinet.
- **Apps Node.js** → [Back_MCLog/log-service-lib/README.md](Back_MCLog/log-service-lib/README.md) — cliente tipado `@enviromentmc/mclog`, sin dependencias.

La ingesta se autentica con el header **`x-api-key`** (variable `API_KEY` del backend). No se necesitan usuarios ni JWT para enviar logs; los usuarios y JWT son solo para el dashboard.

## Documentación

Índice completo en [docs/README.md](docs/README.md).

| Documento | Contenido |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Desglose de todas las funcionalidades |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Documentación técnica del sistema (API, datos, seguridad, despliegue) |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Manual de usuario: consultar, enviar logs y administrar |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, decisiones de diseño y escalabilidad |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Guía de integración REST para cualquier aplicación |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Glosario de términos |
| [docs/FAQ.md](docs/FAQ.md) | Preguntas frecuentes y errores concretos |
| `http://localhost:3000/docs` | Swagger UI interactivo (OpenAPI 3) |

## Tests

```bash
# Backend — 53 tests (auth, ingesta, batch, filtros, export, stats, purga)
cd Back_MCLog
docker compose up -d db       # requiere la DB en localhost:5434
npm test

# Librería — 34 tests
cd Back_MCLog/log-service-lib
npm test
```
