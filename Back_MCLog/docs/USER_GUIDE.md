# Back_MCLog · Guía de Operación

Manual para operar el servicio MCLog en desarrollo y producción.

> Esta guía cubre solo el backend. El manual completo del proyecto —dashboard, integración de aplicaciones y administración— está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md). Dudas concretas en el [FAQ](../../docs/FAQ.md).

## Prerrequisitos

- Node.js 20+ y Docker Desktop (para la base de datos).
- Puertos libres: 3000 (API), 5435 (PostgreSQL en el host), 3001 (dashboard).

## Puesta en marcha local

```bash
cd Back_MCLog
docker compose up -d db
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

Comprueba: `curl http://localhost:3000/health` → `{"status":"ok"}`.

El usuario administrador se crea automáticamente al arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`.

## Despliegue en producción

El `docker-compose.yml` de esta carpeta es **solo para desarrollo**. La pila de producción, con dashboard, proxy Caddy con HTTPS automático y copias de seguridad, vive en [`deploy/`](../../deploy/) y está documentada en [DEPLOYMENT.md](../../docs/DEPLOYMENT.md):

```bash
cd deploy
cp .env.example .env     # dominio, secretos y contraseñas
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones se aplican solas al arrancar la API.

> El arranque **falla a propósito** en producción si quedan secretos por defecto o `CORS_ORIGINS` vacío.

### Rotar claves

Las claves creadas desde el dashboard (Ajustes → API keys) **se rotan sin cortar el servicio**: creas la nueva, actualizas al emisor y revocas la vieja.

La excepción es la variable `API_KEY`, que es única y está deprecada: cambiarla deja fuera a todos los emisores que aún la usen hasta que los actualices.

## Retención de logs

Pon `RETENTION_DAYS` en el `.env` y el propio servicio purga cada hora, en lotes, los logs más antiguos que esa ventana. `RETENTION_DAYS=0` lo desactiva y **la tabla crece sin límite**.

Con varias instancias, deja `SCHEDULER_ENABLED=1` en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

Para una limpieza puntual (por ejemplo, vaciar una aplicación concreta) sigue existiendo el borrado manual:

```bash
# Borra todo lo anterior a 90 días (requiere usuario admin)
TOKEN=$(curl -s -X POST https://tu-api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@...","password":"***"}' | jq -r .accessToken)

curl -X DELETE "https://tu-api/api/logs?before=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  -H "Authorization: Bearer $TOKEN"
# → {"deleted": 12345}
```

Se puede limitar por aplicación con `&application=nombre`. Requiere rol `admin`: una API key no puede purgar, por muchos permisos que tenga.

## Alertas y tiempo real

El planificador que ejecuta la retención evalúa también las **reglas de alerta** cada minuto, y avisa por webhook, correo o Telegram. Se configuran desde el dashboard (Ajustes → Alertas); del backend solo dependen las variables `SMTP_*` para el canal de correo.

`GET /api/logs/stream` emite los logs según se ingieren, por Server-Sent Events, con un tope de `SSE_MAX_CONNECTIONS` conexiones simultáneas **por instancia**. El bus de eventos también es por instancia: con varias réplicas, cada cliente ve los logs que entraron por la suya.

## Acceso para asistentes de IA

`POST /mcp` expone ocho herramientas de investigación por Model Context Protocol. Requiere una API key con permiso `read` y se desactiva con `MCP_ENABLED=0`. Ver [AI_INTEGRATION.md](../../docs/AI_INTEGRATION.md).

## Monitoreo

- **`GET /health`** — para uptime checks y balanceadores. Verifica la base de datos e informa de versión y tiempo en marcha.
- **`GET /metrics`** con una clave de permiso `metrics`. Además de las métricas del proceso, publica la duración de las peticiones por método, ruta y estado, los logs ingeridos por aplicación y nivel, y las conexiones en vivo abiertas.
- **Logs del servicio** — consola (JSON) y `logs/app.log` con rotación (10 MB × 5). Cada request registra `requestId`, `traceId`, status y duración. Con `LOG_LEVEL=debug` también el body (con secretos redactados).

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `429 Too Many Requests` en ingesta | Límite de 2000/min superado | Sube `INGEST_RATE_LIMIT_MAX` o usa `/api/logs/batch` |
| `401` al ingerir | Clave inexistente, revocada o caducada | Revísala en Ajustes → API keys |
| `403` al ingerir | La clave no tiene permiso `ingest`, o el log es de una aplicación fuera de su alcance | La respuesta indica las aplicaciones permitidas |
| `403` al consultar | La clave no tiene permiso `read` | Las claves de ingesta no leen, por diseño |
| `400` al ingerir | Falta campo obligatorio o level/environment inválido | La respuesta incluye `errors` con el detalle por campo |
| Migración falla con "embedded null" | Archivo `migration.sql` guardado en UTF-16 | Guardar en UTF-8 |
| El arranque falla en producción | Secretos por defecto o CORS vacío | Es la validación de seguridad: configura el `.env` |
| Dashboard no conecta (CORS) | Origen no listado | Añade la URL exacta del front a `CORS_ORIGINS` |
| DB no disponible al arrancar | PostgreSQL aún iniciando | La API reintenta 10 veces (30 s); revisa `docker compose ps` |

## Backups

En producción hay un servicio `backup` que hace un `pg_dump` diario con rotación; ver [DEPLOYMENT.md](../../docs/DEPLOYMENT.md#copias-de-seguridad). En desarrollo, a mano:

```bash
docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
```
