# Desplegar en CapRover y Railway

Pon la API y la base de datos de MCLog en un servidor con **CapRover**, y el dashboard en **Railway**, cada uno en su propio subdominio.

## Qué vas a conseguir

```
https://mclog.tu-dominio.com       → dashboard   (Railway)
https://api-mclog.tu-dominio.com   → API         (CapRover, app mclog-api)
srv-captain--mclog-db:5432         → PostgreSQL  (CapRover, app mclog-db, sin dominio público)
```

- La API y la base de datos como **dos apps separadas**: puedes redesplegar la API sin tocar la base.
- La base de datos **nunca expuesta** a Internet.
- El dashboard hablando con la API por HTTPS, con sesiones que funcionan entre los dos dominios.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| Un servidor con **CapRover** | Instalado, con su dominio comodín y HTTPS del panel funcionando |
| La **CLI de CapRover** en tu equipo | `npm install -g caprover`, y `caprover login` hecho contra tu servidor |
| Una cuenta de **Railway** | Con acceso al repositorio de GitHub de MCLog |
| Un **dominio propio** | Para crear dos subdominios **del mismo dominio raíz** (ver por qué en el [paso 5](#paso-5--entiende-los-dos-dominios)) |
| **openssl** | Para generar secretos |

> [!IMPORTANT]
> Usa dos subdominios de **tu** dominio, por ejemplo `mclog.` y `api-mclog.`. Si dejas el dashboard en el dominio `*.up.railway.app` de Railway, el navegador tratará la API como un sitio distinto y las cookies de sesión pueden bloquearse.

## Paso 1 — Crea la base de datos en CapRover

1. En el panel de CapRover: **Apps → One-Click Apps/Databases**, busca **PostgreSQL**.
2. **App Name**: `mclog-db`. Versión **16**.
3. Usuario: `mclog`. Contraseña: genera una con `openssl rand -hex 32` y **guárdala**. Base de datos: `mclog`.
4. Despliega.
5. **No** le asignes dominio, no actives HTTPS y no publiques el puerto 5432. La API la alcanzará por la red interna como `srv-captain--mclog-db`.

## Paso 2 — Crea la app de la API en CapRover

1. **Apps → Create a New App** → nombre `mclog-api` → **Create New App**.
2. Abre la app, pestaña **HTTP Settings**:
   1. En **Connect New Domain**, escribe `api-mclog.tu-dominio.com` (crea antes en tu DNS un registro `A` a la IP del servidor CapRover).
   2. Pulsa **Enable HTTPS** en ese dominio.
   3. Marca **Force HTTPS by redirecting all HTTP traffic to HTTPS**.
   4. En **Container HTTP Port** escribe **`3000`** y guarda.

> [!WARNING]
> El **Container HTTP Port** es el error más habitual: si se queda en `80`, CapRover devuelve `502 Bad Gateway` aunque la API esté perfectamente.

3. Pestaña **App Configs → Environmental Variables**. Activa **Bulk Edit** y pega, rellenando los valores:

   ```bash
   NODE_ENV=production
   DATABASE_URL=postgresql://mclog:<contraseña-del-paso-1>@srv-captain--mclog-db:5432/mclog?schema=public
   JWT_ACCESS_SECRET=<openssl rand -hex 32>
   JWT_REFRESH_SECRET=<otro distinto>
   API_KEY=<openssl rand -hex 32>
   ADMIN_EMAIL=tu-correo@tu-dominio.com
   ADMIN_PASSWORD=<contraseña fuerte>
   CORS_ORIGINS=https://mclog.tu-dominio.com
   PUBLIC_DASHBOARD_URL=https://mclog.tu-dominio.com
   TRUST_PROXY=1
   FORCE_HTTPS=1
   COOKIE_SECURE=1
   COOKIE_SAMESITE=lax
   RETENTION_DAYS=30
   ```

   Guarda con **Save & Update**.

   | Variable | Por qué |
   |---|---|
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Crean la **cuenta root** en el primer arranque |
   | `CORS_ORIGINS` | El origen **exacto** del dashboard: con `https://` y sin barra final |
   | `TRUST_PROXY=1` | La API está detrás del nginx de CapRover; sin esto no ve la IP real ni el `https` |
   | `COOKIE_SAMESITE=lax` | Correcto porque los dos subdominios comparten dominio raíz |

## Paso 3 — Despliega la API

Desde tu equipo, en la carpeta del backend:

```bash
cd Back_MCLog
caprover deploy
```

Elige tu servidor y la app `mclog-api`.

> [!IMPORTANT]
> `caprover deploy` sube el **último commit**, no lo que tienes en disco. Para desplegar cambios sin commitear, empaqueta un `.tar` y súbelo con `caprover deploy -t ./deploy.tar` ([DEPLOYMENT.md § B.3](../DEPLOYMENT.md#b3-la-api-caprover), paso 4).

CapRover construye la imagen con el `Dockerfile` (lo indica `captain-definition`). Al arrancar, el contenedor:

1. aplica las migraciones de la base (`entrypoint.sh`);
2. arranca la API, que crea la cuenta root.

**Comprueba:**

```bash
curl https://api-mclog.tu-dominio.com/health
# → {"status":"ok","database":"up",...}
```

En CapRover, **App Logs** debe mostrar `Server is running`.

## Paso 4 — Despliega el dashboard en Railway

1. En Railway: **New Project → Deploy from GitHub repo** y elige el repositorio de MCLog.
2. En el servicio creado, **Settings**:
   - **Root Directory**: `frontend_mclog`. Railway detectará el `Dockerfile`.
   - **Networking → Custom Domain**: `mclog.tu-dominio.com`. Crea en tu DNS el `CNAME` que te indica Railway y espera a que el certificado esté listo.
3. **Variables** → **New Variable**:

   ```bash
   NEXT_PUBLIC_API_URL=https://api-mclog.tu-dominio.com
   ```

   Sin barra final. **No** definas `PORT`: Railway lo pone solo y la imagen lo usa.
4. Despliega (o **Redeploy** si ya se había desplegado sin la variable).

> [!IMPORTANT]
> `NEXT_PUBLIC_API_URL` se incrusta **al compilar**. Si la cambias, tienes que **redesplegar**; reiniciar no basta.

## Paso 5 — Entiende los dos dominios

El dashboard y la API están en orígenes distintos, así que tres cosas tienen que cuadrar exactamente:

| Dónde | Variable | Valor |
|---|---|---|
| API (CapRover) | `CORS_ORIGINS` | `https://mclog.tu-dominio.com` |
| Dashboard (Railway) | `NEXT_PUBLIC_API_URL` | `https://api-mclog.tu-dominio.com` |
| API (CapRover) | `COOKIE_SECURE` / `COOKIE_SAMESITE` | `1` / `lax` |

Si por algún motivo los dominios no comparten dominio raíz, cambia a `COOKIE_SAMESITE=none` (con `COOKIE_SECURE=1`). Algunos navegadores bloquean igualmente esas cookies, así que es mejor evitarlo. Detalle en [DEPLOYMENT.md § B.5](../DEPLOYMENT.md#b5-dos-dominios-cors-y-cookies).

## Paso 6 — Entra y protege la cuenta root

1. Abre `https://mclog.tu-dominio.com`. Verás la pantalla de acceso.
2. Entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Mi cuenta → Cambiar contraseña**, y después **Verificación en dos pasos**. Guía: [Proteger tu cuenta](seguridad-cuenta.md).
4. Comprueba la cadena completa con **Espacio → Lab → Tráfico normal → Ejecutar**, mira que los logs aparecen en **Logs**, y luego **Borrar datos del lab**.

## Paso 7 — Programa las copias de seguridad

CapRover **no** hace copias de la base por su cuenta. Como mínimo, en el servidor de CapRover:

```bash
# crontab -e  →  volcado diario a las 03:00
0 3 * * * docker exec $(docker ps -qf name=srv-captain--mclog-db) pg_dump -U mclog -Fc mclog > /var/backups/mclog_$(date +\%F).dump
```

Llévalas fuera del servidor (S3, Spaces, otro host) y prueba a restaurar una de vez en cuando. Ver [Copias y mantenimiento](copias-y-mantenimiento.md).

## Comprueba que funcionó

- [ ] `https://api-mclog.tu-dominio.com/health` → `status: ok`.
- [ ] `https://mclog.tu-dominio.com` carga la pantalla de acceso con certificado válido.
- [ ] Puedes entrar, navegar entre pantallas y recargar sin que la sesión se caiga.
- [ ] El escenario **Tráfico normal** del Lab aparece en **Logs**.
- [ ] Hay una copia de la base programada fuera de CapRover.

## Si algo falla

| Síntoma | Causa y solución |
|---|---|
| `502 Bad Gateway` en la API | **Container HTTP Port** no es `3000` |
| La API se reinicia en bucle | En **App Logs**, "Configuración insegura para producción" lista qué variable falta o tiene un valor de ejemplo (`CAMBIAR…`, `change-me`…), o si los secretos JWT son iguales |
| `/health` → `503 degraded` | `DATABASE_URL` mal: host `srv-captain--mclog-db`, usuario, contraseña y base del paso 1 |
| El dashboard dice "No se pudo contactar con el servidor" | `NEXT_PUBLIC_API_URL` mal o sin redesplegar tras cambiarla, o `CORS_ORIGINS` no coincide exactamente. La consola del navegador (F12) muestra el error de CORS |
| Entras, pero al navegar vuelves al login | Las cookies no se guardan: la API no va por HTTPS, falta `COOKIE_SECURE=1`, o los dominios no comparten dominio raíz ([paso 5](#paso-5--entiende-los-dos-dominios)) |
| `caprover deploy` falla con `unable to get local issuer certificate` | Proxy corporativo: apunta `NODE_EXTRA_CA_CERTS` al certificado raíz de tu empresa. Nunca uses `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| El build de Railway falla descargando las fuentes | El build necesita acceso a `fonts.googleapis.com`; revisa los logs del build |

Más casos en [DEPLOYMENT.md](../DEPLOYMENT.md#resolución-de-problemas).

## Siguiente paso

- [Copias y mantenimiento](copias-y-mantenimiento.md): cómo actualizar la API y el dashboard.
- [Administrar espacios, usuarios y claves](administrar-usuarios-y-claves.md).
