# Back_MCLog · Guía de Operación

Manual para operar el servicio MCLog en desarrollo y producción.

> Esta guía cubre solo el backend. El manual completo del proyecto (dashboard, integración de aplicaciones y administración) está en [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md), y las guías paso a paso en [docs/guias/](../../docs/guias/). Dudas concretas en el [FAQ](../../docs/FAQ.md).

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

Comprueba: `curl http://localhost:3000/health` → `{"status":"ok","database":"up",...}`.

### La cuenta root

El usuario administrador se crea automáticamente al arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`, y queda marcado como **cuenta root**:

- No se puede eliminar ni degradar, ni desde el dashboard ni por la API.
- Si pierde el rol `admin`, se le devuelve en el siguiente arranque.
- Si cambias `ADMIN_EMAIL`, la cuenta nueva pasa a ser el root y la anterior queda como un admin normal.
- `ADMIN_PASSWORD` solo se usa para **crear** la cuenta. Cambiarlo después no modifica la contraseña de una cuenta que ya existe; para eso está **Mi cuenta → Cambiar contraseña**.

## Despliegue en producción

El `docker-compose.yml` de esta carpeta es **solo para desarrollo**. Para producción hay dos caminos, ambos documentados en [DEPLOYMENT.md](../../docs/DEPLOYMENT.md):

- **Un VPS con Docker Compose** (dashboard, API, base de datos, proxy Caddy con HTTPS automático y copias de seguridad), desde [`deploy/`](../../deploy/):

  ```bash
  cd deploy
  cp .env.example .env     # dominio, secretos y contraseñas
  docker compose -f docker-compose.prod.yml up -d --build
  ```

- **CapRover** para la API y la base de datos (esta carpeta ya trae `captain-definition`), con el dashboard en otro proveedor como Railway.

En los dos casos, las migraciones se aplican solas al arrancar la API (`entrypoint.sh`).

> El arranque **falla a propósito** en producción si quedan secretos por defecto, si los dos secretos JWT son iguales o si `CORS_ORIGINS` está vacío.

### Rotar claves

Las claves creadas desde el dashboard (**Espacio → API keys**) **se rotan sin cortar el servicio**:

1. Creas la nueva.
2. Actualizas al emisor.
3. Revocas la vieja.

La excepción es la variable `API_KEY`, que es única y está deprecada: cambiarla deja fuera a todos los emisores que aún la usen hasta que los actualices.

## Retención de logs

Pon `RETENTION_DAYS` en el `.env` y el propio servicio purga cada hora, en lotes, los logs más antiguos que esa ventana. `RETENTION_DAYS=0` lo desactiva y **la tabla crece sin límite**.

Con varias instancias, deja `SCHEDULER_ENABLED=1` en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

### Borrado manual

Para una limpieza puntual (por ejemplo, vaciar una aplicación concreta) sigue existiendo el borrado manual. Requiere una **sesión de usuario admin**: una API key no puede purgar, por muchos permisos que tenga.

1. Inicia sesión y guarda la respuesta:

   ```bash
   curl -s -X POST https://tu-api/auth/login -H "Content-Type: application/json" \
     -d '{"email":"admin@...","password":"***"}' > login.json
   ```

2. Mira qué ha devuelto:
   - Si `login.json` contiene `accessToken`, ya tienes el token: `TOKEN=$(jq -r .accessToken login.json)`.
   - Si contiene `"mfaRequired": true`, tu cuenta tiene verificación en dos pasos. Completa el segundo paso **antes de 5 minutos**, con el código que muestra tu app en lugar de `123456`:

     ```bash
     MFA=$(jq -r .mfaToken login.json)
     TOKEN=$(curl -s -X POST https://tu-api/auth/login/2fa -H "Content-Type: application/json" \
       -d "{\"mfaToken\":\"$MFA\",\"code\":\"123456\"}" | jq -r .accessToken)
     ```

3. Lanza la purga (aquí, todo lo anterior a 90 días):

   ```bash
   curl -X DELETE "https://tu-api/api/logs?before=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
     -H "Authorization: Bearer $TOKEN"
   # → {"deleted": 12345}
   ```

4. Borra `login.json`.

Se puede limitar por aplicación con `&application=nombre`.

## Alertas y tiempo real

El planificador que ejecuta la retención evalúa también las **reglas de alerta** cada minuto, y avisa por webhook, correo o Telegram. Se configuran desde el dashboard (**Espacio → Alertas**); del backend solo dependen las variables `SMTP_*` para el canal de correo.

`GET /api/logs/stream` emite los logs según se ingieren, por Server-Sent Events, con un tope de `SSE_MAX_CONNECTIONS` conexiones simultáneas **por instancia**. El bus de eventos también es por instancia: con varias réplicas, cada cliente ve los logs que entraron por la suya.

## Acceso para asistentes de IA

`POST /mcp` expone ocho herramientas de investigación por Model Context Protocol. Requiere una API key con permiso `read` y se desactiva con `MCP_ENABLED=0`. Ver [AI_INTEGRATION.md](../../docs/AI_INTEGRATION.md).

## Monitoreo

- **`GET /health`** — para uptime checks y balanceadores. Verifica la base de datos e informa de versión y tiempo en marcha. Devuelve `503` si la base de datos no responde.
- **`GET /metrics`** con una clave de permiso `metrics`. Además de las métricas del proceso, publica:
  - la duración de las peticiones por método, ruta y estado;
  - los logs ingeridos por aplicación y nivel;
  - las conexiones en vivo abiertas.
- **Logs del servicio** — consola (JSON) y `logs/app.log` con rotación (10 MB × 5).
  - Cada request registra `requestId`, `traceId`, status y duración.
  - Con `LOG_LEVEL=debug`, también el body (con secretos redactados).
  - Los `/health` que responden bien no se registran: el healthcheck del contenedor llama cada 30 s y taparía todo lo demás.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `429 Too Many Requests` en ingesta | Límite de 2000/min superado | Sube `INGEST_RATE_LIMIT_MAX` o usa `/api/logs/batch` |
| `429` al iniciar sesión | 10 intentos fallidos en 15 min desde esa IP | Espera a que pase la ventana o ajusta `LOGIN_RATE_LIMIT_*`. Los intentos correctos no cuentan |
| `401` al ingerir | Clave inexistente, revocada o caducada | Revísala en Espacio → API keys |
| `403` al ingerir | La clave no tiene permiso `ingest`, o el log es de una aplicación fuera de su alcance | La respuesta indica las aplicaciones permitidas |
| `403` al consultar | La clave no tiene permiso `read` | Las claves de ingesta no leen, por diseño |
| `400` al ingerir | Falta campo obligatorio o level/environment inválido | La respuesta incluye `errors` con el detalle por campo |
| `400 HTTPS required` | `FORCE_HTTPS=1` y la petición llegó por HTTP | Entra por `https://`. Detrás de un proxy, pon `TRUST_PROXY=1` para que se lea `x-forwarded-proto` |
| El contenedor se reinicia en bucle | Configuración insegura para producción | El log "Configuración insegura para producción" enumera cada problema: secretos de ejemplo, secretos JWT iguales o CORS vacío |
| El contenedor se reinicia en bucle con `FORCE_HTTPS=1` | Imagen anterior a la exención de loopback: el HEALTHCHECK recibía `400` | Actualiza la imagen; desde loopback ya no se exige HTTPS |
| Migración falla con "embedded null" | Archivo `migration.sql` guardado en UTF-16 | Guardar en UTF-8 |
| Dashboard no conecta (CORS) | Origen no listado | Añade la URL exacta del front a `CORS_ORIGINS` |
| DB no disponible al arrancar | PostgreSQL aún iniciando | La API reintenta 10 veces (30 s); revisa `docker compose ps` |
| Un usuario perdió el móvil y los códigos de recuperación | Ya no puede completar el segundo paso | Ver [Recuperar una cuenta con 2FA](#recuperar-una-cuenta-con-2fa) |

## Recuperar una cuenta con 2FA

Si un usuario pierde la app autenticadora, lo normal es que entre con uno de sus **códigos de recuperación**. Se aceptan en el mismo campo que el código de 6 dígitos. Después, desde **Mi cuenta**, desactiva el 2FA y lo vuelve a activar con el móvil nuevo.

Si también perdió los códigos, no hay forma de recuperarla desde la aplicación. Es a propósito: un admin **no** puede quitar el 2FA de otra cuenta, porque así es como un atacante con una sesión de admin tomaría el control de cualquier usuario. Hay dos salidas:

- **Cuenta normal**: un admin la elimina en **Plataforma → Cuentas** y la vuelve a crear con el mismo correo.
- **Cuenta root**, o si prefieres conservar la cuenta: reinicia el 2FA directamente en la base de datos, después de comprobar la identidad de quien lo pide.

  ```sql
  UPDATE "User"
  SET "twoFactorEnabled" = false, "twoFactorSecret" = NULL,
      "twoFactorLastStep" = NULL, "recoveryCodes" = '{}'
  WHERE email = 'persona@empresa.com';
  ```

  - En desarrollo: `docker compose exec db psql -U postgres mclog`.
  - En producción: el usuario de base de datos que definiste al desplegar.

Tras el reinicio, la persona entra solo con su contraseña y debería activar el 2FA de nuevo.

## Backups

En producción con Docker Compose hay un servicio `backup` que hace un `pg_dump` diario con rotación; ver [DEPLOYMENT.md](../../docs/DEPLOYMENT.md#copias-de-seguridad). En desarrollo, a mano:

```bash
docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
```
