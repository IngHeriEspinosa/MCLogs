# Desplegar en un VPS

Pon MCLog en producción en un solo servidor, con Docker Compose y Caddy: HTTPS automático, dashboard y API bajo el mismo dominio y copias de seguridad diarias.

## Qué vas a conseguir

- MCLog en `https://mclog.tu-dominio.com`, con certificado válido que se renueva solo.
- La base de datos, la API y el dashboard en la red interna de Docker: **solo Caddy** está expuesto.
- Una copia de seguridad diaria de la base de datos.
- La cuenta root protegida y las primeras claves creadas.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| Un **VPS** | 2 vCPU y 2 GB de RAM bastan para empezar. Ubuntu, Debian o similar |
| **Docker Engine 24+** con el plugin **Compose v2** | `docker compose version` debe responder |
| Un **dominio** | Con un registro `A` (y `AAAA` si hay IPv6) apuntando a la IP del VPS |
| Los puertos **80 y 443** abiertos desde Internet | Caddy usa el 80 para obtener el certificado |
| **Git** y **openssl** en el VPS | Para descargar el proyecto y generar secretos |

> [!IMPORTANT]
> Si vas a integrar **NetSuite**, la API tiene que ser alcanzable desde Internet por HTTPS: no vale una IP privada ni un túnel local.

## Paso 1 — Comprueba el DNS

Desde tu equipo:

```bash
nslookup mclog.tu-dominio.com
```

Debe devolver la IP de tu VPS. Si no, espera a que el DNS se propague antes de seguir: sin él, Caddy no podrá obtener el certificado.

## Paso 2 — Descarga el proyecto en el VPS

```bash
git clone https://github.com/IngHeriEspinosa/MCLogs.git mclog
cd mclog/deploy
cp .env.example .env
```

## Paso 3 — Rellena la configuración

Genera **cuatro** secretos distintos, uno por línea:

```bash
openssl rand -hex 32   # repítelo cuatro veces
```

Edita `deploy/.env` (`nano .env`) y cambia **todo lo que empieza por `CAMBIAR`**:

| Variable | Qué poner |
|---|---|
| `MCLOG_DOMAIN` | `mclog.tu-dominio.com`, sin `https://` |
| `POSTGRES_PASSWORD` | Secreto 1 |
| `JWT_ACCESS_SECRET` | Secreto 2 |
| `JWT_REFRESH_SECRET` | Secreto 3 (**distinto** del anterior) |
| `API_KEY` | Secreto 4. Es la clave heredada: no la repartas |
| `ADMIN_EMAIL` | Tu correo real. Será la **cuenta root** |
| `ADMIN_PASSWORD` | Una contraseña fuerte (la cambiarás al entrar) |
| `CORS_ORIGINS` y `PUBLIC_DASHBOARD_URL` | `https://mclog.tu-dominio.com`, exacto y **sin barra final** |
| `RETENTION_DAYS` | Días de logs a conservar (30 por defecto). `0` = nunca borrar |

El resto ya tiene valores correctos para este despliegue (`TRUST_PROXY=1`, `FORCE_HTTPS=1`, `COOKIE_SECURE=1`…).

> [!WARNING]
> Guarda una copia de `deploy/.env` en tu gestor de secretos: si pierdes `POSTGRES_PASSWORD` o los secretos JWT, restaurar será mucho más difícil. Y no lo subas nunca al repositorio.

## Paso 4 — Levanta todo

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez tarda unos minutos: construye las imágenes de la API y del dashboard. Al arrancar, la API aplica las migraciones y crea la cuenta root.

## Paso 5 — Comprueba que funciona

```bash
docker compose -f docker-compose.prod.yml ps
```

`db`, `api`, `web`, `caddy` y `backup` deben estar `running` (y `db` y `api`, `healthy` tras unos segundos). Luego:

```bash
curl https://mclog.tu-dominio.com/health
```

debe responder `{"status":"ok","database":"up",...}`.

Si la API se reinicia en bucle, mira sus logs: `docker compose -f docker-compose.prod.yml logs api`. Si dice "Configuración insegura para producción", la lista de debajo dice qué variable corregir.

## Paso 6 — Protege la cuenta root

1. Abre `https://mclog.tu-dominio.com`, pulsa **Iniciar sesión** y entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Mi cuenta → Cambiar contraseña**: pon una nueva. Te devolverá al login.
3. **Mi cuenta → Verificación en dos pasos → Activar verificación en dos pasos**, y guarda los códigos de recuperación **fuera del servidor**. Guía: [Proteger tu cuenta](seguridad-cuenta.md).

## Paso 7 — Prepara el uso diario

1. **Crea usuarios** con su propio correo para el día a día (**Plataforma → Cuentas**). Deja la cuenta root para emergencias.
2. **Crea una API key por aplicación** que vaya a enviar logs (**Espacio → API keys**). Guía: [Administrar espacios, usuarios y claves](administrar-usuarios-y-claves.md).
3. **Comprueba la cadena completa**: **Espacio → Lab → Tráfico normal → Ejecutar**. Si los logs aparecen en **Logs**, todo funciona. Luego **Borrar datos del lab**.

## Paso 8 — Saca las copias del servidor

El servicio `backup` hace un volcado diario en `deploy/backups/`, **en el mismo disco**. Si pierdes el disco, las pierdes con él. Programa en el VPS una copia externa, por ejemplo con `rclone` a S3/Spaces:

```bash
# crontab -e
30 4 * * * rclone copy /ruta/a/mclog/deploy/backups remoto:mclog-backups
```

Detalle y restauración en [Copias y mantenimiento](copias-y-mantenimiento.md).

## Comprueba que funcionó

- [ ] `https://mclog.tu-dominio.com` carga con candado (certificado válido).
- [ ] `/health` responde `status: ok`.
- [ ] Entraste con la cuenta root, cambiaste su contraseña y activaste el 2FA.
- [ ] El escenario **Tráfico normal** del Lab aparece en **Logs**.
- [ ] `ls deploy/backups/` muestra al menos un `.dump` (el primero se hace al arrancar).

## Si algo falla

| Síntoma | Solución |
|---|---|
| Caddy no consigue el certificado | El DNS no apunta aún al VPS, o el puerto 80 está cerrado (firewall del proveedor o `ufw`). Mira `docker compose -f docker-compose.prod.yml logs caddy` |
| La API se reinicia en bucle | "Configuración insegura para producción": corrige las variables que lista. Otras causas: `POSTGRES_PASSWORD` cambiada después del primer arranque (la base conserva la anterior) |
| `/health` responde `503 degraded` | La API no alcanza la base. Revisa `logs db` |
| El login dice "No se pudo contactar con el servidor" | `CORS_ORIGINS` no coincide exactamente con `https://<MCLOG_DOMAIN>` |
| La sesión se cae al navegar | `PUBLIC_DASHBOARD_URL`/`CORS_ORIGINS` distintos del dominio real, o falta `TRUST_PROXY=1` |
| `--build` falla descargando paquetes o fuentes | El VPS no tiene salida a Internet, o hay un proxy que intercepta TLS |

Más casos en [DEPLOYMENT.md](../DEPLOYMENT.md#resolución-de-problemas).

## Siguiente paso

- [Copias y mantenimiento](copias-y-mantenimiento.md): actualizar versiones y restaurar copias.
- [Configurar alertas](configurar-alertas.md).
- Conectar tus aplicaciones: [Node.js](integrar-node.md), [NetSuite](integrar-netsuite.md), [otros lenguajes](../INTEGRATION.md).
