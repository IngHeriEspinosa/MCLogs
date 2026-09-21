# MCLog — Despliegue en producción

Guía para poner MCLog en un VPS con Docker Compose y Caddy. Caddy obtiene y renueva el certificado HTTPS automáticamente, y sirve el dashboard y la API bajo el mismo dominio.

Escrito para quien administra el servidor. Para usar la aplicación una vez desplegada, ver [USER_GUIDE.md](USER_GUIDE.md).

---

## 1. Qué se despliega

```
                         Internet
                            │  443
                    ┌───────▼────────┐
                    │     Caddy      │  HTTPS automático (Let's Encrypt)
                    └───┬────────┬───┘
         /api /auth     │        │    todo lo demás
         /mcp /health   │        │
                 ┌──────▼──┐  ┌──▼──────┐
                 │   api   │  │   web   │   sin puertos publicados
                 │  :3000  │  │  :3001  │
                 └────┬────┘  └─────────┘
                      │
                 ┌────▼────┐   ┌──────────┐
                 │   db    │◄──│  backup  │  pg_dump diario
                 │ Postgres│   └──────────┘
                 └─────────┘
```

Solo Caddy publica puertos. La base de datos, la API y el dashboard quedan en la red interna de Docker y no son alcanzables desde fuera del host.

**Servir ambos bajo el mismo dominio no es un detalle estético.** Elimina el CORS entre orígenes y permite cookies `SameSite=Lax`, que es la configuración de sesión más robusta. Con dominios separados hacen falta `SameSite=None` y una lista blanca de CORS exacta, y las sesiones se caen en cuanto algo no cuadra.

---

## 2. Requisitos

| Requisito | Detalle |
|---|---|
| VPS | 2 vCPU y 2 GB de RAM sobran para empezar. El disco depende de la retención |
| Sistema | Cualquiera con Docker Engine 24+ y el plugin Compose v2 |
| DNS | Un registro `A` (y `AAAA` si hay IPv6) apuntando al VPS |
| Puertos | 80 y 443 abiertos desde Internet. Caddy necesita el 80 para validar el certificado |

> NetSuite es SaaS: para que sus scripts puedan enviar logs, la API tiene que ser alcanzable desde Internet por HTTPS. No vale una IP privada ni un túnel local.

---

## 3. Primer despliegue

```bash
git clone <url-del-repositorio> mclog
cd mclog/deploy

cp .env.example .env
```

Edita `deploy/.env`. Los valores obligatorios:

```bash
# Genera cada secreto por separado; no reutilices el mismo en dos variables
openssl rand -hex 32
```

| Variable | Qué poner |
|---|---|
| `MCLOG_DOMAIN` | El dominio que ya resuelve al VPS, sin `https://` |
| `POSTGRES_PASSWORD` | Contraseña larga y aleatoria |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Dos valores **distintos** de `openssl rand -hex 32` |
| `API_KEY` | Aleatoria. Es la clave heredada; lo normal es no repartirla y crear claves con scopes desde el dashboard |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del primer administrador. El valor de `.env.example` es público: el arranque lo rechaza en producción |
| `CORS_ORIGINS` / `PUBLIC_DASHBOARD_URL` | `https://<tu dominio>`, exacto y sin barra final |
| `RETENTION_DAYS` | Días de logs a conservar. `0` desactiva la purga y la tabla crecerá sin límite |

Levanta todo:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La API aplica las migraciones al arrancar y crea el usuario administrador. Comprueba:

```bash
docker compose -f docker-compose.prod.yml ps
curl https://<tu dominio>/health
```

`/health` debe responder `{"status":"ok","database":"up",...}`. Entra en `https://<tu dominio>` con las credenciales de administrador y **cambia la contraseña** desde **Mi cuenta**.

> **El arranque falla a propósito** si `NODE_ENV=production` y queda algún `CAMBIAR-...` sin rellenar, los dos secretos JWT son iguales o `CORS_ORIGINS` está vacío. El mensaje lista de una vez todo lo que falta. Es la guardia de configuración, no un error.

---

## 4. Después del primer arranque

### 4.1 Crear las claves de las integraciones

Desde **Administración → API keys**. El secreto se muestra **una sola vez**: cópialo en ese momento, porque en la base solo queda su hash.

| Para qué | Scopes | Aplicaciones |
|---|---|---|
| Que una app envíe sus logs | `ingest` | La suya, para que no pueda escribir en nombre de otra |
| Que una IA lea errores | `read` | Las que deba ver |
| Prometheus | `metrics` | — |

Una clave de ingesta comprometida puede escribir logs basura, pero **no leer nada**. Es la razón de separar los scopes.

### 4.2 Conectar tus aplicaciones

- Cualquier lenguaje → [INTEGRATION.md](INTEGRATION.md)
- NetSuite → [../integrations/netsuite/README.md](../integrations/netsuite/README.md)
- Node.js → [../packages/mclog/README.md](../packages/mclog/README.md)

---

## 5. Operación

### Ver el estado y los logs del propio servicio

```bash
cd mclog/deploy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy   # problemas de certificado
```

### Actualizar a una versión nueva

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones pendientes se aplican solas al arrancar la API. **Haz una copia antes** si la versión trae cambios de esquema (ver abajo).

### Copias de seguridad

El servicio `backup` hace un `pg_dump` diario en `deploy/backups/` y conserva `BACKUP_RETENTION_DAYS` (14 por defecto). Para forzar una ahora:

```bash
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
ls -lh backups/
```

Restaurar:

```bash
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml run --rm backup \
  /scripts/restore.sh /backups/mclog_2026-09-19_030000.dump
docker compose -f docker-compose.prod.yml start api
```

> Las copias viven en el mismo disco que la base. **Cópialas fuera del VPS** (S3, Spaces, otro servidor): si pierdes el disco, las pierdes con él. Un `rsync` o `rclone` en cron basta.

### Rotar la clave heredada o los secretos JWT

Cambiar `JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET` invalida todas las sesiones abiertas y obliga a volver a entrar. Cambiar `API_KEY` deja fuera a los emisores que aún la usen, hasta que los actualices. Las claves creadas desde el dashboard se rotan de una en una sin cortar el servicio: creas la nueva, actualizas al emisor y revocas la vieja.

---

## 6. Resolución de problemas

| Síntoma | Causa habitual |
|---|---|
| Caddy no consigue certificado | El DNS no apunta todavía al VPS, o el puerto 80 está cerrado. Mira `logs caddy` |
| La API no arranca y habla de configuración insegura | Quedan secretos de desarrollo, `CORS_ORIGINS` vacío o el `ADMIN_PASSWORD` de ejemplo en `deploy/.env` |
| `/health` responde `503 degraded` | La API vive pero no alcanza PostgreSQL. Revisa `logs db` y `POSTGRES_PASSWORD` |
| La sesión se cae al navegar | `CORS_ORIGINS` o `PUBLIC_DASHBOARD_URL` no coinciden **exactamente** con el dominio, o falta `TRUST_PROXY=1` |
| El disco se llena | `RETENTION_DAYS=0` o demasiado alto. Mira el tamaño con `docker compose exec db psql -U mclog -d mclog -c "\dt+"` |
| Los emisores reciben `429` | Superan el límite de ingesta. Agrupa en lotes antes de subir `INGEST_RATE_LIMIT_MAX` |

---

## 7. Escalar

El backend es **stateless**: todo el estado vive en PostgreSQL, así que se pueden levantar varias réplicas de `api` detrás de Caddy sin cambios. Dos advertencias:

1. **El rate limiting es por instancia** (vive en memoria), así que el límite efectivo se multiplica por el número de réplicas.
2. **Deja `SCHEDULER_ENABLED=1` en una sola instancia.** Varias purgas simultáneas compiten por las mismas filas sin aportar nada.

El orden recomendado de evolución (particionado de la tabla, réplicas de lectura, cola intermedia) está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).
