# Primeros pasos

Instala MCLog en tu equipo, entra en el dashboard, crea tu primera API key y envía tu primer log. Unos 15 minutos.

## Qué vas a conseguir

Al terminar tendrás:

- La API de MCLog funcionando en `http://localhost:3000`.
- El dashboard en `http://localhost:3001`, con tu sesión de administrador.
- Una API key con permiso para enviar logs.
- Un log tuyo visible en la pantalla **Logs**.

## Antes de empezar

| Necesitas | Cómo comprobarlo |
|---|---|
| **Node.js 20 o superior** | `node --version` → `v20.x` o más |
| **Docker Desktop**, arrancado | `docker --version` y el icono de Docker en marcha |
| **Git** | `git --version` |
| Los puertos **3000**, **3001** y **5435** libres | Si alguno está ocupado, ver [Si algo falla](#si-algo-falla) |

> [!NOTE]
> Esta guía es para **probar MCLog en tu equipo**. Para ponerlo en un servidor de verdad, sigue [Desplegar en un VPS](desplegar-vps.md) o [Desplegar en CapRover y Railway](desplegar-caprover-railway.md).

## Paso 1 — Descarga el proyecto

```bash
git clone https://github.com/IngHeriEspinosa/MCLogs.git mclog
cd mclog
```

## Paso 2 — Arranca la base de datos

MCLog guarda los logs en PostgreSQL, que se levanta con Docker:

```bash
cd Back_MCLog
docker compose up -d db
```

**Comprueba:** `docker compose ps` muestra el servicio `db` en estado `running` (o `healthy`).

## Paso 3 — Arranca la API

En la misma carpeta `Back_MCLog`:

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea tu fichero de configuración a partir del de ejemplo. Para uso local no hace falta cambiar nada:

   ```bash
   cp .env.example .env
   ```

3. Crea las tablas en la base de datos:

   ```bash
   npx prisma migrate deploy
   ```

   Debe terminar con `All migrations have been successfully applied` (o `No pending migrations to apply`).

4. Arranca la API y **deja esta terminal abierta**:

   ```bash
   npm run dev
   ```

**Comprueba:** en otra terminal,

```bash
curl http://localhost:3000/health
```

debe responder algo como `{"status":"ok","database":"up",...}`.

> [!TIP]
> Al arrancar por primera vez, la API crea sola el usuario administrador del `.env`: `admin@example.com` con contraseña `ChangeMe123!`. Es la **cuenta root**, la única que no se puede borrar.

## Paso 4 — Arranca el dashboard

En una **terminal nueva**, desde la raíz del proyecto:

```bash
cd frontend_mclog
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` le dice al dashboard dónde está la API (`NEXT_PUBLIC_API_URL=http://localhost:3000`).

**Comprueba:** abre **http://localhost:3001** en el navegador. Verás la pantalla de acceso de MCLog.

## Paso 5 — Entra en el dashboard

1. En **Correo** escribe `admin@example.com` y en **Contraseña** `ChangeMe123!`.
2. Pulsa **Entrar**.

Llegas a la pantalla **Logs**, todavía vacía. A la izquierda tienes el menú; arriba a la derecha, el idioma y el tema.

## Paso 6 — Crea una API key

Las aplicaciones no usan tu usuario para enviar logs: usan una **API key**.

1. En el menú, abre **Espacio → API keys**.
2. En el formulario **Nueva clave**:
3. En **Nombre**, escribe `mi-primera-app`.
4. En **Permisos**, marca solo **Enviar logs**.
5. Deja **Aplicaciones** y **Caducidad** vacías.
6. Pulsa **Crear clave**.
7. Aparece la clave, que empieza por `mclog_`. **Cópiala ahora**: es la única vez que se muestra.
8. Pulsa **Ya la he guardado**.

## Paso 7 — Envía tu primer log

En una terminal, sustituye `mclog_...` por tu clave:

```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: mclog_..." \
  -d '{
    "application": "mi-primera-app",
    "level": "info",
    "environment": "development",
    "message": "Hola MCLog"
  }'
```

La respuesta es el log creado, con su `id`. Esos cuatro campos son los únicos obligatorios; el resto lo rellena el servidor.

> [!TIP]
> En Windows con PowerShell, `curl` es otro programa. Usa `curl.exe` y escribe el JSON en una sola línea, o prueba desde **Git Bash**.

## Comprueba que funcionó

1. Vuelve al dashboard, a **Logs**.
2. Pulsa el botón de refrescar, o espera unos segundos.
3. Tu log aparece en la tabla: aplicación `mi-primera-app`, nivel info, mensaje "Hola MCLog".
4. Haz clic en la fila para ver su detalle: MCLog le ha añadido un `traceId`, el `host` y la hora.

## Siguiente paso

- **Ver MCLog con datos de verdad** sin escribir más código: [Probar con el Lab](probar-con-el-lab.md). En dos clics tendrás errores agrupados, trazas y un pico de incidente.
- **Enviar logs desde tu aplicación**: [Integrar una aplicación Node.js](integrar-node.md), [Integrar NetSuite](integrar-netsuite.md) o, para otros lenguajes, [INTEGRATION.md](../INTEGRATION.md).
- **Proteger tu cuenta**, que es lo primero en un servidor real: [Proteger tu cuenta](seguridad-cuenta.md).

## Si algo falla

| Síntoma | Solución |
|---|---|
| `docker compose up` dice que el puerto 5435 está ocupado | Otra base de datos usa ese puerto. Detenla, o cambia el mapeo `5435:5432` en `Back_MCLog/docker-compose.yml` y la `DATABASE_URL` del `.env` |
| `npm run dev` de la API dice `EADDRINUSE :3000` | Algo ya usa el puerto 3000. Ciérralo o cambia `PORT` en `.env` (y `NEXT_PUBLIC_API_URL` en `frontend_mclog/.env.local`) |
| `prisma migrate deploy` no conecta | La base aún está arrancando. Espera unos segundos y repite; comprueba `docker compose ps` |
| El login dice "No se pudo contactar con el servidor" | La API no está arrancada, o `NEXT_PUBLIC_API_URL` no apunta a ella. Tras cambiar `.env.local`, reinicia `npm run dev` del dashboard |
| El login dice "Credenciales inválidas" | Revisa `ADMIN_EMAIL`/`ADMIN_PASSWORD` en `Back_MCLog/.env`. Si los cambiaste después del primer arranque, el usuario ya existía con los valores anteriores |
| `curl` responde `401` | La clave está mal copiada, o la cabecera no es exactamente `x-api-key` |
| `curl` responde `400` | Falta un campo obligatorio o tiene un valor no válido. La respuesta dice cuál en `errors` |
| El log no aparece en la tabla | Mira el **rango de tiempo** de arriba: tiene que incluir "ahora". Y comprueba que el entorno no esté filtrado a otro distinto de `development` |
| `npm install` falla con `unable to get local issuer certificate` | Estás detrás de un proxy corporativo. Usa `NODE_OPTIONS=--use-system-ca` (Node 22.15+) |

Más casos en el [FAQ](../FAQ.md).
