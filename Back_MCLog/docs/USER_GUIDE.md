# Back_MCLog · Guía de Operación

Manual para operar el servicio MCLog en desarrollo y producción.

> Esta guía cubre solo el backend. El manual completo del proyecto —dashboard, integración de aplicaciones y administración— está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Dudas concretas en el [FAQ](../../docs/FAQ.md).

## Prerrequisitos

- Node.js 20+ y Docker Desktop (para la base de datos).
- Puertos libres: 3000 (API), 5434 (PostgreSQL en el host), 3001 (dashboard).

## Puesta en marcha local

```bash
cd Back_MCLog
docker compose up -d db
npm install
cp .env.example .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/mclog?schema=public" npx prisma migrate deploy
npm run dev
```

Comprueba: `curl http://localhost:3000/health` → `{"status":"ok"}`.

El usuario administrador se crea automáticamente al arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`.

## Despliegue en producción (Docker)

1. Copia `.env.example` a `.env` y **cambia obligatoriamente**:
   - `NODE_ENV=production`
   - `API_KEY` → clave larga y aleatoria (p. ej. `openssl rand -hex 32`)
   - `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` → aleatorios distintos entre sí
   - `ADMIN_PASSWORD` → contraseña fuerte
   - `CORS_ORIGINS` → URL exacta del dashboard (p. ej. `https://logs.tu-dominio.com`)
   - `FORCE_HTTPS=1`, `COOKIE_SECURE=1`, `TRUST_PROXY=1` (si hay proxy/load balancer)
2. `docker compose up -d` — levanta PostgreSQL y la API; las migraciones se aplican solas al arrancar.
3. Verifica `https://tu-api/health` y entra al dashboard.

> El arranque **falla a propósito** en producción si quedan secretos por defecto o CORS vacío.

### Rotar la API key

Cambia `API_KEY` en el `.env`, reinicia la API (`docker compose up -d api`) y actualiza la clave en todos los emisores (NetSuite, servicios, scripts).

## Retención de logs

La tabla crece sin límite si no se purga. Ejecuta periódicamente (cron, scheduler, o manual):

```bash
# Borra todo lo anterior a 90 días (requiere usuario admin)
TOKEN=$(curl -s -X POST https://tu-api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@...","password":"***"}' | jq -r .accessToken)

curl -X DELETE "https://tu-api/api/logs?before=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  -H "Authorization: Bearer $TOKEN"
# → {"deleted": 12345}
```

Se puede limitar por aplicación con `&application=nombre`.

## Monitoreo

- **`GET /health`** — para uptime checks / load balancer (verifica la DB).
- **`GET /metrics`** con header `x-api-key` — métricas Prometheus del proceso.
- **Logs del servicio** — consola (JSON) y `logs/app.log` con rotación (10 MB × 5). Cada request registra `requestId`, `traceId`, status y duración. Con `LOG_LEVEL=debug` también el body (con secretos redactados).

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `429 Too Many Requests` en ingesta | Límite de 2000/min superado | Sube `INGEST_RATE_LIMIT_MAX` o usa `/api/logs/batch` |
| `401` al ingerir | API key incorrecta o sin header | Verifica `x-api-key` contra `API_KEY` del `.env` |
| `400` al ingerir | Falta campo obligatorio o level/environment inválido | La respuesta incluye `errors` con el detalle por campo |
| Migración falla con "embedded null" | Archivo `migration.sql` guardado en UTF-16 | Guardar en UTF-8 |
| El arranque falla en producción | Secretos por defecto o CORS vacío | Es la validación de seguridad: configura el `.env` |
| Dashboard no conecta (CORS) | Origen no listado | Añade la URL exacta del front a `CORS_ORIGINS` |
| DB no disponible al arrancar | PostgreSQL aún iniciando | La API reintenta 10 veces (30 s); revisa `docker compose ps` |

## Backups

Los datos viven en el volumen Docker `pgdata`. Backup estándar:

```bash
docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
```
