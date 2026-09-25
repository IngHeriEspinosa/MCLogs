# MCLog — Despliegue en producción

Cómo poner MCLog en producción, escrito para quien administra el servidor. Para usar la aplicación una vez desplegada, ver [USER_GUIDE.md](USER_GUIDE.md).

Hay dos formas soportadas. Las dos usan las mismas imágenes (`Back_MCLog/Dockerfile` y `frontend_mclog/Dockerfile`):

| | Opción A — VPS con Docker Compose | Opción B — CapRover + Railway |
|---|---|---|
| **Dónde** | Todo en un solo servidor | API y base de datos en CapRover; dashboard en Railway |
| **Dominios** | Uno solo: dashboard y API bajo el mismo | Dos: uno para el dashboard y otro para la API |
| **HTTPS** | Caddy, automático | El de CapRover y el de Railway |
| **Copias de seguridad** | Servicio `backup` incluido | Por tu cuenta (ver [Copias en la opción B](#copias-de-seguridad-en-la-opción-b)) |
| **Cuándo elegirla** | Por defecto: es la más simple de operar | Si ya tienes CapRover y Railway, o quieres redesplegar el dashboard y la API por separado |

> **¿Prefieres ir paso a paso?** Las guías [Desplegar en un VPS](guias/desplegar-vps.md) y [Desplegar en CapRover y Railway](guias/desplegar-caprover-railway.md) recorren cada opción de principio a fin, con comprobaciones.

---

## Opción A — VPS con Docker Compose

Caddy obtiene y renueva el certificado HTTPS automáticamente, y sirve el dashboard y la API bajo el mismo dominio.

### A.1 Qué se despliega

```
                         Internet
                            │  443
                    ┌───────▼────────┐
                    │     Caddy      │  HTTPS automático (Let's Encrypt)
                    └───┬────────┬───┘
         /api /auth     │        │    todo lo demás
         /mcp /health   │        │
         /metrics /docs │        │
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

**Servir ambos bajo el mismo dominio no es un detalle estético:**

- Elimina el CORS entre orígenes.
- Permite cookies `SameSite=Lax`, que es la configuración de sesión más robusta.

Con dominios separados (opción B) también funciona, pero hay que configurar CORS y cookies con cuidado.

El servidor del dashboard también llama a la API, para la vista previa de los enlaces de snapshots en Slack o WhatsApp. Como el navegador usa rutas relativas (`NEXT_PUBLIC_API_URL` vacía), `docker-compose.prod.yml` le da la dirección interna con `API_INTERNAL_URL=http://api:3000`. En la opción B no hace falta nada: usa `NEXT_PUBLIC_API_URL`.

### A.2 Requisitos

| Requisito | Detalle |
|---|---|
| VPS | 2 vCPU y 2 GB de RAM sobran para empezar. El disco depende de la retención |
| Sistema | Cualquiera con Docker Engine 24+ y el plugin Compose v2 |
| DNS | Un registro `A` (y `AAAA` si hay IPv6) apuntando al VPS |
| Puertos | 80 y 443 abiertos desde Internet. Caddy necesita el 80 para validar el certificado |

> NetSuite es SaaS: para que sus scripts puedan enviar logs, la API tiene que ser alcanzable desde Internet por HTTPS. No vale una IP privada ni un túnel local.

### A.3 Primer despliegue

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
| `API_KEY` | Aleatoria. Es la clave heredada y deprecada; lo normal es no repartirla y crear claves con permisos desde el dashboard |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales de la **cuenta root** (el primer administrador, que no se puede borrar ni degradar). El valor de `.env.example` es público: el arranque lo rechaza en producción |
| `CORS_ORIGINS` / `PUBLIC_DASHBOARD_URL` | `https://<tu dominio>`, exacto y sin barra final |
| `RETENTION_MONTHS` | Meses de logs a conservar, entre 3 y 60 (3 por defecto). La cuenta root lo cambia después desde **Plataforma → Configuración** |

Levanta todo:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La API aplica las migraciones al arrancar y crea el usuario administrador. Comprueba:

```bash
docker compose -f docker-compose.prod.yml ps
curl https://<tu dominio>/health
```

`/health` debe responder `{"status":"ok","database":"up",...}`. Después sigue con [Después del primer arranque](#después-del-primer-arranque).

> **El arranque falla a propósito** si `NODE_ENV=production` y se da cualquiera de estos casos:
> - queda algún `CAMBIAR-...` sin rellenar;
> - los dos secretos JWT son iguales;
> - `CORS_ORIGINS` está vacío.
>
> El mensaje lista de una vez todo lo que falta. Es la guardia de configuración, no un error.

### A.4 Operación

#### Ver el estado y los logs del propio servicio

```bash
cd mclog/deploy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy   # problemas de certificado
```

#### Actualizar a una versión nueva

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

Restaurar (sobrescribe los datos actuales y pide confirmación):

```bash
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml run --rm backup \
  /scripts/restore.sh /backups/mclog_2026-09-19_030000.dump
docker compose -f docker-compose.prod.yml start api
```

> Las copias viven en el mismo disco que la base. **Cópialas fuera del VPS** (S3, Spaces, otro servidor): si pierdes el disco, las pierdes con él. Un `rsync` o `rclone` en cron basta.

---

## Opción B — CapRover + Railway

La API y la base de datos corren en un servidor con **CapRover**, cada una como una app distinta, y el dashboard en **Railway**.

```
Navegador ──► https://mclog.tu-dominio.com            (Railway: frontend_mclog)
    │
    └── peticiones con cookies ──► https://api-mclog.tu-dominio.com   (CapRover: app mclog-api)
                                          │  red interna de CapRover
                                          ▼
                                   srv-captain--mclog-db:5432          (CapRover: app mclog-db, sin dominio)
```

**Por qué dos apps en CapRover y no una:** así se redespliega la API sin tocar la base. La base de datos nunca recibe dominio público: la API la alcanza por la red interna de CapRover. El nginx de CapRover ya hace TLS y el enrutado, así que Caddy no hace falta.

### B.1 Requisitos

| Requisito | Detalle |
|---|---|
| CapRover | Un servidor con CapRover instalado y su dominio comodín configurado (`*.captain.tu-dominio.com` o similar) |
| CLI | `npm install -g caprover` en tu equipo, para desplegar |
| Railway | Una cuenta y un proyecto. El repositorio conectado desde GitHub |
| DNS | Un subdominio para la API y otro para el dashboard, **del mismo dominio raíz** (recomendado, ver [B.5](#b5-dos-dominios-cors-y-cookies)) |

### B.2 La base de datos (CapRover)

1. En CapRover, **Apps → One-Click Apps/Databases → PostgreSQL**.
2. Nombre de la app: `mclog-db`. Versión 16. Pon un usuario, una contraseña larga y aleatoria y la base `mclog`.
3. **No** actives dominio ni HTTPS para esta app, ni publiques el puerto 5432. La API la alcanzará como `srv-captain--mclog-db:5432`.

### B.3 La API (CapRover)

1. **Apps → Create a new app** → nombre `mclog-api`.
2. En **HTTP Settings**:
   - Conecta el dominio de la API (`api-mclog.tu-dominio.com`), pulsa **Enable HTTPS** y marca **Force HTTPS by redirecting all HTTP traffic to HTTPS**.
   - **Container HTTP Port: `3000`.** Si lo dejas en `80`, verás un `502` de nginx aunque la app esté sana.
3. En **App Configs → Environmental Variables**, añade como mínimo:

   ```bash
   NODE_ENV=production
   DATABASE_URL=postgresql://<usuario>:<contraseña>@srv-captain--mclog-db:5432/mclog?schema=public
   JWT_ACCESS_SECRET=<openssl rand -hex 32>
   JWT_REFRESH_SECRET=<otro distinto>
   API_KEY=<openssl rand -hex 32>        # clave heredada: no la repartas
   ADMIN_EMAIL=tu-correo@tu-dominio.com  # cuenta root
   ADMIN_PASSWORD=<contraseña fuerte>
   CORS_ORIGINS=https://mclog.tu-dominio.com
   PUBLIC_DASHBOARD_URL=https://mclog.tu-dominio.com
   TRUST_PROXY=1
   FORCE_HTTPS=1
   COOKIE_SECURE=1
   COOKIE_SAMESITE=lax                   # "none" si los dominios no comparten dominio raíz (B.5)
   RETENTION_MONTHS=3
   ```

   El resto de variables tiene valores por defecto razonables; la lista completa está en [TECHNICAL.md](TECHNICAL.md#5-configuración).
4. Despliega desde tu equipo, en la carpeta del backend:

   ```bash
   cd Back_MCLog
   caprover deploy        # elige el servidor y la app mclog-api
   ```

   CapRover construye la imagen con el `Dockerfile` que indica `captain-definition`. Al arrancar, `entrypoint.sh` aplica las migraciones y lanza el servidor, que crea la cuenta root.

   > [!IMPORTANT]
   > Dentro de un repositorio git, `caprover deploy` sube el **último commit** (`git archive HEAD`), no lo que tienes en disco: los cambios sin commitear no se despliegan. Si quieres desplegar sin commitear, usa un `.tar`, como se explica a continuación.

   **Desplegar desde un `.tar`.** Empaqueta lo que usa el `Dockerfile` y súbelo. El `npx tsc` frena el empaquetado si el código no compila:

   ```bash
   cd Back_MCLog
   npx tsc --noEmit -p . && tar -cf deploy.tar ./.dockerignore ./Dockerfile ./captain-definition ./entrypoint.sh \
     ./package-lock.json ./package.json ./prisma ./prisma.config.ts ./src ./tsconfig.json
   caprover deploy -t ./deploy.tar
   ```

   En PowerShell, la misma orden con `tar.exe` (viene con Windows) y `if ($?) { … }` en lugar de `&&`. También se puede subir a mano en la app: **Deployment → Method 2: Tarball**. `deploy.tar` está en `.gitignore`.
5. Comprueba:

   ```bash
   curl https://api-mclog.tu-dominio.com/health
   # → {"status":"ok","database":"up",...}
   ```

### B.4 El dashboard (Railway)

1. En Railway, **New → GitHub Repo** y elige el repositorio.
2. En **Settings** del servicio:
   - **Root Directory**: `frontend_mclog`. Railway detecta el `Dockerfile`.
   - **Networking → Custom Domain**: `mclog.tu-dominio.com`, y crea en tu DNS el `CNAME` que te indica.
3. En **Variables**, añade:

   ```bash
   NEXT_PUBLIC_API_URL=https://api-mclog.tu-dominio.com
   ```

   Es una variable **de compilación**: Next la incrusta en el código del navegador. Railway la pasa al build porque el `Dockerfile` la declara con `ARG`. Si la cambias, hay que redesplegar.
4. No definas `PORT`: Railway lo inyecta y la imagen escucha en él.
5. Despliega y abre `https://mclog.tu-dominio.com`. Deberías ver la pantalla de acceso de MCLog; entra con la cuenta root.

### B.5 Dos dominios: CORS y cookies

Con el dashboard y la API en dominios distintos, el navegador trata la API como otro origen. Tres cosas tienen que cuadrar:

| Qué | Dónde | Valor |
|---|---|---|
| El origen del dashboard | `CORS_ORIGINS` (API) | `https://mclog.tu-dominio.com`, **exacto**: con `https`, sin barra final |
| La URL de la API | `NEXT_PUBLIC_API_URL` (dashboard, al compilar) | `https://api-mclog.tu-dominio.com` |
| Las cookies de sesión | `COOKIE_SECURE`, `COOKIE_SAMESITE` (API) | `1` y `lax` o `none` (abajo) |

**`lax` o `none`:**

- **Mismo dominio raíz** (`mclog.tu-dominio.com` y `api-mclog.tu-dominio.com`): el navegador los considera el mismo *sitio*, así que `COOKIE_SAMESITE=lax` funciona y es lo más seguro. **Es la configuración recomendada.**
- **Dominios de sitios distintos** (por ejemplo, el `*.up.railway.app` de Railway frente al dominio de CapRover): hace falta `COOKIE_SAMESITE=none` con `COOKIE_SECURE=1`. Algunos navegadores bloquean igualmente las cookies de terceros, y entonces la sesión se cae. Usa dominios propios.

**La API siempre por HTTPS.** Con HTTP plano, las contraseñas y los tokens viajan en claro, y las cookies `secure` ni siquiera se guardan.

### Copias de seguridad en la opción B

CapRover no trae copias automáticas de la base. Como mínimo, programa un volcado diario desde el servidor de CapRover y sácalo de la máquina:

```bash
# En el servidor de CapRover; el contenedor de la base se llama srv-captain--mclog-db.<id>
docker exec $(docker ps -qf name=srv-captain--mclog-db) \
  pg_dump -U <usuario> -Fc mclog > /var/backups/mclog_$(date +%F).dump
```

Llévate esos ficheros fuera del servidor (S3, Spaces, otro host) con `rclone` o `rsync`, y **prueba a restaurar uno** de vez en cuando: una copia que nunca se ha restaurado no es una copia.

### Actualizar a una versión nueva

- **API**: `cd Back_MCLog && caprover deploy` (sube el último commit) o, con cambios sin commitear, un `.tar` ([B.3](#b3-la-api-caprover), paso 4). Las migraciones se aplican solas al arrancar.
- **Dashboard**: Railway redespliega con cada push a la rama conectada, o desde **Deployments → Redeploy**. Es un despliegue aparte: el `.tar` del backend no lo incluye.

Haz una copia de la base antes si la versión trae cambios de esquema.

---

## Después del primer arranque

Lo mismo para las dos opciones.

### Proteger la cuenta root

1. Entra en el dashboard con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. En **Mi cuenta → Cambiar contraseña**, pon una contraseña nueva. Te devolverá al login.
3. En **Mi cuenta → Verificación en dos pasos**, actívala y guarda los códigos de recuperación fuera del servidor. Ver [USER_GUIDE.md § A.7](USER_GUIDE.md#a7-tu-cuenta-y-su-seguridad).

La cuenta root no se puede borrar ni degradar. Para el día a día, crea usuarios con su propio correo en **Plataforma → Cuentas**.

### Crear las claves de las integraciones

Desde **Espacio → API keys → Nueva clave**. El secreto se muestra **una sola vez**: cópialo en ese momento, porque en la base solo queda su hash.

| Para qué | Permisos | Aplicaciones |
|---|---|---|
| Que una app envíe sus logs | `ingest` (Enviar logs) | La suya, para que no pueda escribir en nombre de otra |
| Que una IA lea errores | `read` (Consultar logs y errores) | Las que deba ver |
| Prometheus | `metrics` (Leer métricas Prometheus) | — |

Una clave de ingesta comprometida puede escribir logs basura, pero **no leer nada**. Es la razón de separar los permisos.

### Comprobar que todo funciona

**Espacio → Lab → Tráfico normal → Ejecutar** envía 120 logs de prueba (al entorno **Desarrollo**). Si aparecen en **Logs**, la cadena completa funciona. Bórralos después con **Borrar datos del lab**.

### Conectar tus aplicaciones

- Cualquier lenguaje → [INTEGRATION.md](INTEGRATION.md)
- NetSuite → [guías/integrar-netsuite](guias/integrar-netsuite.md)
- Node.js → [guías/integrar-node](guias/integrar-node.md)
- Asistentes de IA → [AI_INTEGRATION.md](AI_INTEGRATION.md)

---

## Rotar la clave heredada o los secretos JWT

- **`JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET`**: cambiarlos invalida todas las sesiones abiertas y obliga a volver a entrar. También invalida los inicios de sesión con 2FA que estén a medias.
- **`API_KEY`**: cambiarla deja fuera a los emisores que aún la usen, hasta que los actualices.
- **Claves creadas desde el dashboard**: se rotan de una en una sin cortar el servicio. Creas la nueva, actualizas al emisor y revocas la vieja.
- **`ADMIN_EMAIL`**: si lo cambias, la cuenta nueva pasa a ser el root y la anterior queda como admin normal.

---

## Resolución de problemas

| Síntoma | Causa habitual |
|---|---|
| Caddy no consigue certificado (A) | El DNS no apunta todavía al VPS, o el puerto 80 está cerrado. Mira `logs caddy` |
| **`502 Bad Gateway` en CapRover con la app sana** (B) | **Container HTTP Port** sigue en `80`. Ponlo en `3000`. Síntoma típico: los logs de la app dicen `Server is running` y el healthcheck da 200, pero desde fuera hay 502 |
| La API se reinicia en bucle y el log dice "Configuración insegura para producción" | Quedan secretos o contraseñas de ejemplo, los dos secretos JWT son iguales o `CORS_ORIGINS` está vacío. El mensaje lista cada problema |
| El contenedor se reinicia en bucle con `FORCE_HTTPS=1` | Imagen antigua: el healthcheck interno recibía `400 HTTPS required`. Las versiones actuales eximen a las peticiones de loopback; actualiza |
| `/health` responde `503 degraded` | La API vive pero no alcanza PostgreSQL. Revisa la base y `DATABASE_URL` (en B, el host `srv-captain--mclog-db`) |
| El dashboard muestra "No se pudo contactar con el servidor" (B) | `NEXT_PUBLIC_API_URL` mal puesta o sin HTTPS, o `CORS_ORIGINS` no coincide **exactamente** con el origen del dashboard. Mira la consola del navegador |
| La sesión se cae al navegar | `CORS_ORIGINS` o `PUBLIC_DASHBOARD_URL` no coinciden exactamente con el dominio, falta `TRUST_PROXY=1`, o (B) los dominios son de sitios distintos y `COOKIE_SAMESITE` no es `none` ([B.5](#b5-dos-dominios-cors-y-cookies)) |
| `unable to get local issuer certificate` al hacer `caprover deploy` o `docker build` | Un proxy corporativo intercepta TLS. Apunta `NODE_EXTRA_CA_CERTS` al certificado raíz de la empresa; nunca uses `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| El disco se llena | La retención (**Plataforma → Configuración**) es demasiado alta. Mira el tamaño con `psql -c "\dt+"` dentro del contenedor de la base |
| Los emisores reciben `429` | Superan el límite de ingesta. Agrupa en lotes antes de subir `INGEST_RATE_LIMIT_MAX` |
| El stream **En vivo** no muestra nada detrás de un proxy propio | El proxy acumula la respuesta. Caddy ya lo resuelve (`flush_interval -1`) y la API manda `X-Accel-Buffering: no` para nginx |

---

## Escalar

Sesiones, claves y logs viven en PostgreSQL, así que se pueden levantar varias réplicas de la API detrás del proxy. Tres advertencias:

1. **El rate limiting es por instancia** (vive en memoria), así que el límite efectivo se multiplica por el número de réplicas.
2. **Deja `SCHEDULER_ENABLED=1` en una sola instancia.** Varias purgas o evaluaciones de alertas simultáneas compiten por las mismas filas sin aportar nada.
3. **El stream en vivo es por instancia**: cada cliente ve los logs que entraron por su réplica.

El orden recomendado de evolución (particionado de la tabla, réplicas de lectura, cola intermedia) está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).
