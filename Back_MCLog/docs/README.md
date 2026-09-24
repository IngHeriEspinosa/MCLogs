# MCLog — Backend (Back_MCLog)

API REST de captura y consulta centralizada de logs.

- **Ingesta** por API key (`x-api-key`) o JWT: `POST /api/log` y `POST /api/logs/batch` (hasta 500 por lote).
- **Consulta** por JWT o API key con permiso `read`: filtros, búsqueda libre y avanzada por campo, orden, paginación, export CSV/NDJSON, estadísticas, errores agrupados, trazas y purga por fecha (admin).
- **Seguridad**: JWT con refresh rotativo en cookies httpOnly, verificación en dos pasos (TOTP + códigos de recuperación), cuenta root protegida, borrado de la propia cuenta, helmet, CORS con lista blanca, rate limits separados para ingesta, consulta y login, validación estricta, HTTPS forzable.
- **Operación**: alertas (webhook, correo, Telegram), retención automática, stream en vivo (SSE) y servidor MCP para asistentes de IA.
- **Espacios de trabajo** con dueños y miembros, y **configuración de la plataforma** en caliente (solo root).
- **Snapshots**: copias congeladas de Logs, Errores o una Traza con enlace propio, de equipo o públicas (enmascaradas en el servidor), con vista previa para chats.
- **Compresión** brotli/gzip de las respuestas JSON, sin dependencias.
- **Observabilidad**: `/health`, `/metrics` (Prometheus), Swagger en `/docs`, logging estructurado con requestId/traceId y duración.

## Arranque rápido

```bash
docker compose up -d db        # PostgreSQL en localhost:5435
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev                    # http://localhost:3000
```

O todo en Docker: `docker compose up -d` (la API aplica migraciones al arrancar).

## Documentación

**De este componente:**

- [TECHNICAL.md](TECHNICAL.md) — referencia completa: endpoints, auth, modelo de datos, env vars, seguridad, tests.
- [USER_GUIDE.md](USER_GUIDE.md) — operación: despliegue, retención, monitoreo, troubleshooting.

**Del proyecto** ([índice completo](../../docs/README.md)):

- [FEATURES.md](../../docs/FEATURES.md) — desglose de todas las funcionalidades.
- [TECHNICAL.md](../../docs/TECHNICAL.md) — documentación técnica del sistema completo.
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — arquitectura y escalabilidad.
- [INTEGRATION.md](../../docs/INTEGRATION.md) — cómo integrar aplicaciones emisoras.
- [GLOSSARY.md](../../docs/GLOSSARY.md) · [FAQ.md](../../docs/FAQ.md)

Swagger UI interactivo: `http://localhost:3000/docs`.

## Tests

```bash
docker compose up -d db
npm test    # 238 tests en 19 suites (vitest + supertest contra DB real)
```
