# MCLog — Manual de Usuario

Este manual cubre los tres perfiles que usan MCLog:

- **[Parte A — Consultar logs](#parte-a--consultar-logs-dashboard)**: para quien investiga incidentes desde el dashboard. No requiere conocimientos técnicos.
- **[Parte B — Enviar logs](#parte-b--enviar-logs-desde-tu-aplicación)**: para quien integra una aplicación.
- **[Parte C — Administrar](#parte-c--administrar-el-servicio)**: para quien opera el servicio.

Si no sabes qué significa alguna palabra, está en el [Glosario](GLOSSARY.md). Si algo no funciona, mira el [FAQ](FAQ.md).

---

# Parte A — Consultar logs (dashboard)

## A.1 Entrar

1. Abre el dashboard. En desarrollo: **http://localhost:3001**
2. Escribe tu correo y contraseña. Te las da el administrador del servicio.
3. Entras directo a la pantalla de logs.

**Sobre tu sesión:** se renueva sola mientras estés usando la aplicación, así que no te va a echar en mitad de una investigación. Si dejas la pestaña abandonada mucho tiempo, al volver te llevará al login.

## A.2 La pantalla principal

### Tarjetas de resumen (arriba)

Cuatro números que se actualizan solos **cada minuto**:

| Tarjeta | Qué te dice |
|---|---|
| **Total de logs** | Cuántos registros hay almacenados en total |
| **Últimas 24 h** | Volumen del último día — un salto brusco suele indicar un problema |
| **Errores / Warnings** | Conteo acumulado por severidad |
| **App más activa** | Qué aplicación genera más logs, y cuántos |

### Filtros

Se combinan entre sí: cuantos más pongas, más se acota la búsqueda. La tabla se actualiza sola.

| Filtro | Cómo funciona |
|---|---|
| **Nivel** | debug, info, warn o error |
| **Entorno** | development, staging o production |
| **Aplicación** | Escribe parte del nombre — no hace falta el nombre exacto ni respetar mayúsculas |
| **Buscar** | Busca en el mensaje, la aplicación, el servicio, el host y el traceId a la vez |
| **Desde / Hasta** | Rango de fecha y hora |
| **Ordenar por** | Fecha, aplicación, nivel, host o entorno — con el botón ↓/↑ cambias entre descendente y ascendente |

> **Comparte lo que ves.** La dirección del navegador refleja los filtros activos. Copia la URL y pégala en un chat: quien la abra verá exactamente tu misma vista.

### La tabla

Cada fila es un evento: fecha, aplicación, servicio, nivel, entorno y mensaje. El nivel va con color para localizarlo de un vistazo (rojo = error, ámbar = warn, azul = info, gris = debug).

**Haz clic en cualquier fila** y se despliega con el detalle completo:

- **Host** — la máquina o instancia que lo generó
- **TraceId** — el identificador para seguir la operación entre sistemas
- **Mensaje completo** — sin recortar
- **Metadata** — el contexto en JSON que envió la aplicación (ids, tiempos, datos del error…)

Abajo eliges cuántos registros ver por página (10, 25, 50 o 100) y navegas con Anterior / Siguiente.

### Descargar

Los botones **CSV** y **NDJSON** descargan los logs **con los filtros que tengas puestos** — no todo, solo lo que estás viendo. Hasta 10 000 registros.

- **CSV** — se abre directo en Excel. No incluye la metadata.
- **NDJSON** — un JSON por línea, **con la metadata completa**. Para procesarlo con herramientas.

### Cerrar sesión

Botón arriba a la derecha.

## A.3 Cómo investigar un incidente

**Te avisan de un fallo en producción a las 10:30.**

1. Pon **Nivel = error** y **Entorno = production**.
2. Ajusta **Desde** unos minutos antes de la hora del aviso.
3. Mira la columna Aplicación: normalmente el problema se concentra en una.
4. Abre la primera fila relevante y **copia su TraceId**.
5. Limpia el filtro de nivel y pega el TraceId en **Buscar**.

Ahora ves **toda la operación completa**, en todos los sistemas por los que pasó y en orden — incluidos los `info` que llevan al error. Ahí suele estar la causa.

## A.4 Consejos

- **El filtro de fechas es el que más se olvida activo.** Si ves "No hay registros que coincidan" y esperabas resultados, límpialo primero.
- **Empieza ancho y ve cerrando.** Es más rápido que adivinar el filtro exacto a la primera.
- **La metadata es donde está lo bueno.** El mensaje te dice *qué* falló; la metadata suele decirte *con qué datos*.
- **Comparte la URL, no capturas de pantalla.** Quien la reciba puede seguir filtrando desde ahí.

---

# Parte B — Enviar logs desde tu aplicación

Guía completa con ejemplos por lenguaje en [INTEGRATION.md](INTEGRATION.md). Resumen:

## B.1 Lo que necesitas

- La **URL** del servicio (ej. `https://mclog.tu-dominio.com`)
- La **API key** — te la da el administrador. Trátala como una contraseña.

No necesitas usuario ni contraseña para enviar logs: eso es solo para consultar.

## B.2 La forma más simple

```bash
curl -X POST https://mclog.tu-dominio.com/api/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "application": "mi-app",
    "level": "info",
    "environment": "production",
    "message": "Proceso completado"
  }'
```

Solo esos cuatro campos son obligatorios. El servidor rellena el resto.

## B.3 Desde Node.js

```bash
npm install @enviromentmc/mclog
```

```ts
import { createMCLogClient } from "@enviromentmc/mclog";

const mclog = createMCLogClient({
  baseUrl: "https://mclog.tu-dominio.com",
  apiKey: process.env.MCLOG_API_KEY!,
  application: "mi-servicio",
  environment: "production",
});

await mclog.info("Servidor iniciado");
await mclog.error("Fallo al procesar pedido", { orderId: 42 });
```

Si MCLog está caído, **tu aplicación no se rompe**: la llamada devuelve `false` y sigue adelante.

## B.4 Desde NetSuite

Sube el módulo de [integrations/netsuite/](../integrations/netsuite/) al File Cabinet y úsalo desde tus scripts. Adjunta solo el `scriptId`, `deploymentId`, `accountId`, `userId` y el governance restante.

## B.5 Reglas de oro

1. **Nunca bloquees tu aplicación por el logging.** Si el servicio de logs cae, tu app debe seguir.
2. **Usa lotes en procesos masivos.** Una petición de 500 logs, no 500 peticiones. Es lo que hace `sendBatch`.
3. **Usa `traceId`** si la operación cruza varios sistemas: pásalo entre ellos y podrás reconstruir la traza completa desde el dashboard.
4. **Una `application` por aplicación real**, y `service` para el subcomponente. Si todo se llama igual, el filtro por aplicación deja de servir.
5. **Metadata compacta**: ids y valores relevantes, no volcados completos de registros.
6. **La API key es un secreto.** Si se filtra, pide que la roten.

---

# Parte C — Administrar el servicio

## C.1 Arranque local

Requisitos: Node.js 20+ y Docker Desktop. Puertos libres: 3000, 3001 y 5434.

```bash
# 1. Base de datos
cd Back_MCLog
docker compose up -d db

# 2. Backend
npm install
cp .env.example .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/mclog?schema=public" npx prisma migrate deploy
npm run dev                    # http://localhost:3000

# 3. Dashboard (otra terminal)
cd ../frontend_mclog
npm install
npm run dev                    # http://localhost:3001
```

Comprueba que responde: `curl http://localhost:3000/health` → `{"status":"ok"}`.

Entra en http://localhost:3001 con el `ADMIN_EMAIL` / `ADMIN_PASSWORD` de tu `.env` (por defecto `admin@example.com` / `ChangeMe123!`).

## C.2 Despliegue en producción

**Antes de nada, cambia en el `.env`:**

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `API_KEY` | Aleatoria y larga: `openssl rand -hex 32` |
| `JWT_ACCESS_SECRET` | Aleatoria |
| `JWT_REFRESH_SECRET` | Aleatoria **y distinta** de la anterior |
| `ADMIN_PASSWORD` | Contraseña fuerte |
| `CORS_ORIGINS` | La URL exacta del dashboard, ej. `https://logs.tu-dominio.com` |
| `FORCE_HTTPS`, `COOKIE_SECURE` | `1` |
| `TRUST_PROXY` | `1` si hay proxy o balanceador delante |

Luego:

```bash
docker compose up -d      # levanta PostgreSQL y la API; las migraciones se aplican solas
```

> **Si el arranque falla quejándose de la configuración, es a propósito.** El servicio se niega a arrancar en producción con secretos por defecto o sin CORS configurado. Corrige el `.env` y vuelve a intentarlo.

Verifica `https://tu-api/health` y entra al dashboard.

## C.3 Crear usuarios

El administrador inicial se crea solo al arrancar, a partir de `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

**No hay endpoint de alta de usuarios todavía.** Para añadir más, insértalos directamente con el hash bcrypt:

```bash
# Generar el hash
node -e "console.log(require('bcryptjs').hashSync('LaContraseña', 12))"

# Insertarlo
docker compose exec db psql -U postgres -d mclog -c \
  "INSERT INTO \"User\" (email, \"passwordHash\", role) VALUES ('persona@empresa.com', '<hash>', 'user');"
```

Roles disponibles: `user` (consultar y exportar) y `admin` (además, purgar).

## C.4 Rotar la API key

1. Cambia `API_KEY` en el `.env`.
2. Reinicia: `docker compose up -d api`.
3. **Actualiza la clave en todos los emisores** (NetSuite, servicios, scripts).

Entre los pasos 2 y 3 los emisores recibirán `401`. Si no puedes permitirte ese hueco, coordina el cambio en una ventana de baja actividad.

## C.5 Retención de logs

**La tabla crece sin límite si no la purgas.** Programa esto en un cron:

```bash
# Borrar todo lo anterior a 90 días
TOKEN=$(curl -s -X POST https://tu-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@...","password":"***"}' | jq -r .accessToken)

curl -X DELETE "https://tu-api/api/logs?before=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  -H "Authorization: Bearer $TOKEN"
# → {"deleted": 12345}
```

Se puede acotar a una aplicación con `&application=nombre`. Requiere rol `admin`.

## C.6 Monitoreo

| Qué | Cómo |
|---|---|
| **Salud** | `GET /health` — comprueba servidor y base de datos. Apúntalo desde tu uptime check |
| **Métricas** | `GET /metrics` con header `x-api-key` — formato Prometheus (CPU, memoria, event loop) |
| **Logs del servicio** | Consola en JSON y `logs/app.log` (rotación 10 MB × 5). Una línea por petición con `requestId`, `traceId`, status y duración |
| **Detalle extra** | `LOG_LEVEL=debug` añade el body de las peticiones, con contraseñas y tokens redactados |

## C.7 Backups

Los datos viven en el volumen Docker `pgdata`:

```bash
docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
```

Restaurar:

```bash
docker compose exec -T db psql -U postgres -d mclog < backup_2026-08-08.sql
```

## C.8 Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `429 Too Many Requests` al ingerir | Superado el límite de 2000/min | Sube `INGEST_RATE_LIMIT_MAX` o agrupa con `/api/logs/batch` |
| `401` al ingerir | API key incorrecta o header ausente | Verifica `x-api-key` contra `API_KEY` del `.env` |
| `400` al ingerir | Falta un campo obligatorio, o level/environment inválido | La respuesta trae `errors` con el detalle campo por campo |
| El arranque falla en producción | Secretos por defecto o `CORS_ORIGINS` vacío | Es la validación de seguridad. Configura el `.env` |
| El dashboard no conecta (CORS) | Origen no listado | Añade la URL **exacta** del front a `CORS_ORIGINS` |
| La base no está disponible al arrancar | PostgreSQL aún iniciando | La API reintenta 10 veces en 30 s. Revisa `docker compose ps` |
| Migración falla con "embedded null" | El `.sql` se guardó en UTF-16 | Vuelve a guardarlo en UTF-8 |
| Sesión que se cae constantemente | Cookies bloqueadas | Con front y API en dominios distintos, necesitas HTTPS, `COOKIE_SECURE=1` y `COOKIE_SAMESITE=none` |

Más casos en el [FAQ](FAQ.md).
