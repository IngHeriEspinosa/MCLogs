# MCLog — Preguntas Frecuentes

Términos en el [Glosario](GLOSSARY.md) · Manual completo en [USER_GUIDE.md](USER_GUIDE.md) · Referencia técnica en [TECHNICAL.md](TECHNICAL.md)

---

## Índice

- [General](#general)
- [Enviar logs](#enviar-logs)
- [Consultar y buscar](#consultar-y-buscar)
- [Sesiones y usuarios](#sesiones-y-usuarios)
- [Verificación en dos pasos](#verificación-en-dos-pasos)
- [Alertas](#alertas)
- [El Lab](#el-lab)
- [Acceso para IA](#acceso-para-ia)
- [Errores concretos](#errores-concretos)
- [Operación y rendimiento](#operación-y-rendimiento)
- [Despliegue](#despliegue)
- [Seguridad](#seguridad)
- [Desarrollo](#desarrollo)

---

## General

### ¿Qué es exactamente MCLog?
Un servicio donde **todas** tus aplicaciones mandan sus logs, y un dashboard web para buscarlos en un solo sitio. En vez de entrar por SSH a tres servidores y abrir NetSuite para reconstruir un incidente, filtras por fecha y aplicación en una pantalla.

### ¿Qué aplicaciones pueden enviar logs?
Cualquiera que pueda hacer una petición HTTP: NetSuite/SuiteScript, servicios Node.js, scripts Python, Java, PHP, un cron de bash con `curl`. No hay requisitos de lenguaje ni de plataforma.

### ¿Sustituye a mi logging actual?
No, lo complementa. Sigue escribiendo tus logs locales; MCLog es la capa **centralizada** para lo que quieres poder consultar y correlacionar desde fuera. No mandes todo: manda lo que investigarías después.

### ¿Necesito instalar alguna librería?
No. Un `POST` HTTP basta. Hay dos clientes listos por comodidad —[`@multicomputos-srl/mclog`](../packages/mclog/README.md) para Node y el [módulo SuiteScript](../integrations/netsuite/) para NetSuite— pero son opcionales.

### ¿Se puede usar en producción?
Sí. Tiene guardias de configuración que impiden arrancar con secretos por defecto, rate limiting, HTTPS forzable, verificación en dos pasos y validación estricta. Lo que **debes** decidir tú:

- **La retención**: entre 3 meses y 5 años, desde **Plataforma → Configuración**; si el disco es pequeño, [bájala](#la-base-de-datos-crece-sin-parar-qué-hago).
- **Las copias de seguridad**: el despliegue con Docker Compose trae un servicio diario, pero hay que llevarlas fuera del servidor.

Ver [DEPLOYMENT.md](DEPLOYMENT.md).

### ¿Cómo lo pruebo sin integrar nada todavía?
Con el **Lab** (Espacio → Lab): escenarios que envían logs de prueba y te llevan a la pantalla donde se ve el resultado. Ver [El Lab](#el-lab).

---

## Enviar logs

### ¿Cuál es el mínimo que tengo que enviar?
Cuatro campos:

```json
{ "application": "mi-app", "level": "info", "environment": "production", "message": "Hola" }
```

El servidor rellena solo `service`, `host`, `traceId` y `timestamp`.

### ¿Necesito usuario y contraseña para enviar logs?
No. Enviar solo requiere una **API key con permiso `ingest`** en la cabecera `x-api-key`, creada en **Espacio → API keys**. Los usuarios y contraseñas son para entrar al dashboard.

### ¿Qué pasa si MCLog está caído cuando mi app intenta enviar un log?
Depende de cómo lo hayas integrado:

- Con la **librería Node**: reintenta los fallos transitorios y, si no lo consigue, la llamada devuelve `false` y tu app continúa. No lanza excepción salvo que lo pidas con `throwOnError: true`.
- Con el **cliente NetSuite**: registra el fallo con `N/log`, devuelve `false` y el script sigue. No reintenta, para no quemar governance.
- Con **fetch/curl a pelo**: eres tú quien debe capturar el error. Ponlo siempre en un `try/catch` o un `.catch()`.

La regla es innegociable: **el logging nunca debe tumbar la aplicación**.

### ¿Cuántos logs puedo mandar de golpe?
500 por petición con `POST /api/logs/batch` (configurable con `MAX_BATCH_SIZE`). El cuerpo de la petición no puede pasar de 3 MB (`BODY_LIMIT`). Si usas `sendBatch` de la librería Node o del cliente NetSuite, puedes pasarle un array de cualquier tamaño: lo trocea solo, por número de entradas y por bytes.

### ¿Hay límite de peticiones?
2000 por minuto para ingesta, por defecto. Si lo superas recibes `429`. Casi siempre la solución correcta no es subir el límite, sino **agrupar en lotes**.

### ¿Qué meto en `metadata`?
Lo que necesitarías para diagnosticar el problema después: ids de registro, id de usuario, parámetros de entrada, tiempos, el mensaje de la excepción. Compacto — ids y valores, no volcados completos de registros.

### ¿Cuál es la diferencia entre `application` y `service`?
`application` es la aplicación real; `service` el subcomponente dentro de ella.

```
application: "facturacion"   service: "generador-pdf"
application: "facturacion"   service: "sync-netsuite"
```

Si no envías `service`, se copia `application`. El error típico es usar `application` para cada script: el filtro por aplicación del dashboard se vuelve inútil.

### ¿Debo enviar `timestamp` o dejar que lo ponga el servidor?
Déjalo salvo que acumules logs para enviarlos después (un batch al final de un proceso, una cola, un reintento). En ese caso **envíalo**: si no, todos quedarán con la hora del envío en lugar de la del suceso.

### ¿Puedo enviar logs desde el navegador?
Técnicamente sí, pero tendrías que exponer la API key en el código del cliente, donde cualquiera puede leerla. Manda los eventos de front a tu propio backend y que este los reenvíe a MCLog.

---

## Consultar y buscar

### El buscador, ¿dónde busca?
En el mensaje, la aplicación, el servicio y el host (coincidencia parcial, sin distinguir mayúsculas) y en el traceId (coincidencia exacta). Basta con que aparezca en uno de ellos.

### ¿Y si quiero buscar solo en un campo concreto?
Usa **Registros → Búsqueda avanzada**. Tiene seis campos independientes (**Mensaje contiene**, **Servicio**, **Host**, **Trace ID exacto**, **Nombre del error** y **Código de error**) que se combinan entre sí con Y. Por ejemplo, `Servicio = checkout` + `Código de error = ECONNRESET` devuelve solo los ECONNRESET de checkout, cosa que el buscador general no puede distinguir. Todos admiten texto parcial salvo el Trace ID, que es exacto.

### ¿Qué diferencia hay entre Logs y Registros?
Muestran la misma tabla y el mismo detalle (una ventana casi a pantalla completa, con <kbd>←</kbd> <kbd>→</kbd> para recorrer la página). **Logs** añade el resumen, el gráfico de actividad y el modo en vivo: es para vigilar. **Registros** quita todo eso y añade la búsqueda avanzada: es para buscar y leer.

### ¿Cómo sigo una operación que pasa por varios sistemas?
Con el **traceId**. Abre cualquier log de la operación, copia su traceId y pégalo en el buscador: aparece la traza completa, en orden, de todos los sistemas implicados. Para que funcione entre sistemas, tu código debe propagar el mismo traceId a los que llame.

### Filtré y no aparece nada, pero sé que hay logs
Por orden de probabilidad:

1. **El filtro de fechas.** Es el que más se queda puesto sin querer. Límpialo primero.
2. **El entorno.** Estás en `production` y el log era de `staging`.
3. **El nombre de la aplicación.** Es coincidencia parcial, pero tiene que aparecer en el nombre.

### ¿Cuántos registros puedo exportar?
Hasta 10 000 por descarga (`MAX_EXPORT_ROWS`), respetando los filtros activos. Para más, acota por rangos de fecha y haz varias descargas.

### ¿CSV o NDJSON?
**CSV** si vas a abrirlo en Excel — pero no lleva la metadata. **NDJSON** si necesitas la metadata o vas a procesarlo con herramientas: lleva el registro completo, un JSON por línea.

### ¿Puedo consultar los logs desde un script en lugar del dashboard?
Sí. Lo más cómodo es una **API key con permiso `read`** (las de `ingest` no leen):

```bash
curl -s "https://tu-api/api/logs?level=error&pageSize=50" -H "x-api-key: $MCLOG_READ_KEY"
```

También vale la sesión de un usuario (JWT), pero caduca a los 15 minutos y, si el usuario tiene verificación en dos pasos, el login no devuelve el token directamente: ver [INTEGRATION.md § Consulta programática](INTEGRATION.md#consulta-programática-opcional).

### ¿Se actualiza solo el dashboard?
Las **tarjetas de resumen** se refrescan cada 60 segundos. La **tabla** tiene un botón **En vivo**: al activarlo, los logs nuevos aparecen arriba resaltados según llegan, sin recargar.

Solo se puede activar en la primera página y con el orden por fecha descendente. En cualquier otra vista, anteponer filas nuevas mentiría sobre lo que estás mirando.

### ¿Cómo le enseño lo que veo a alguien que no tiene cuenta?
Con un **snapshot**: en Logs, Registros, Errores o Traza pulsa **Compartir**, elige **Público** y copia el enlace. Quien lo abra ve el resumen y la tabla tal como estaban, sin entrar. Los correos, IPs, tokens y contraseñas se enmascaran siempre, y el nombre de tu espacio no aparece. Solo el dueño del espacio puede crear públicos; para tu equipo basta **Equipo**. Paso a paso: [Compartir un snapshot](guias/compartir-snapshots.md).

### ¿Por qué el snapshot no muestra los logs nuevos?
Porque es una copia: guarda los datos del momento en que se creó, para que lo que se discute no cambie ni desaparezca con la retención. Si quieres la vista con datos actuales, comparte la URL de la página (solo sirve a miembros del espacio). Un snapshot guarda como mucho 500 logs (lo ajusta la cuenta root); si había más, lo avisa.

### Al pegar el enlace en Slack o WhatsApp sale una tarjeta genérica
Es lo esperado con un snapshot **de equipo**: la vista previa la pide un robot sin sesión, y de un snapshot privado no debe salir ni el título. Los **públicos** muestran título, tipo y cifras. Si uno público también sale genérico, el servidor del dashboard no llega a la API: revisa `API_INTERNAL_URL` (Compose) o `NEXT_PUBLIC_API_URL` (dominios separados). Algunas apps guardan la vista previa un tiempo: tras corregirlo, prueba con un enlace nuevo.

### ¿Los snapshots cuentan para la retención?
No. Son copias aparte, con su propia caducidad (1, 7 o 30 días, o nunca). Si necesitas que un dato desaparezca del todo, borra también los snapshots que lo contengan desde la página **Snapshots**.

---

## Sesiones y usuarios

### ¿Cómo creo usuarios nuevos?
Desde el dashboard, en **Plataforma → Cuentas**, si tu usuario es `admin`. Puedes dar de alta, cambiar el rol, restablecer la contraseña y eliminar. El admin inicial se sigue creando solo al arrancar desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Algunas operaciones están bloqueadas a propósito: nadie puede borrarse a sí mismo desde esa pantalla, nadie puede eliminar o degradar la **cuenta root**, y nadie puede eliminar o degradar al último administrador. Sin ellas sería posible dejar el servicio sin quien lo administre.

### ¿Qué es la cuenta root?
La del `ADMIN_EMAIL` del backend, que se crea sola al arrancar por primera vez. Lleva la etiqueta **Root** en Usuarios y no se puede eliminar ni degradar, ni siquiera ella misma: así el servicio siempre tiene una puerta de entrada. Si cambias `ADMIN_EMAIL`, la nueva cuenta pasa a ser el root y la anterior queda como un admin normal.

### ¿Qué roles hay?
En la plataforma, `user` y `admin`: el admin gestiona las cuentas y es dueño de todos los espacios. Dentro de cada espacio, **dueño** (administra: miembros, claves, alertas, Lab y purga) y **miembro** (solo observa).

### ¿Puedo eliminar mi propia cuenta?
Sí, en **Mi cuenta → Zona de peligro → Eliminar mi cuenta**. Pide tu contraseña, el código de la verificación en dos pasos si la tienes, y que escribas `ELIMINAR`. No se puede deshacer. Las API keys que creaste siguen funcionando. La cuenta root y la del último administrador no se pueden eliminar.

### Olvidé la contraseña de un usuario
Cualquier administrador puede restablecerla desde **Plataforma → Cuentas**. Con SMTP y `PUBLIC_DASHBOARD_URL` configurados, cualquiera puede pedir un enlace desde **¿Olvidaste tu contraseña?** en el acceso. Sin correo configurado y si quien la ha perdido es el único administrador, no hay recuperación desde la aplicación (bcrypt es de una vía): hay que generar un hash nuevo y actualizar la fila a mano.

```bash
node -e "console.log(require('bcryptjs').hashSync('NuevaContraseña', 12))"
docker compose exec db psql -U postgres -d mclog -c \
  "UPDATE \"User\" SET \"passwordHash\"='<hash>' WHERE email='admin@example.com';"
```

(En producción, usa el usuario de base de datos de tu despliegue en lugar de `postgres`.) Cambiar `ADMIN_PASSWORD` en el `.env` **no** sirve: solo se usa al crear la cuenta.

### ¿Por qué mi sesión no caduca a los 15 minutos?
Porque el access token dura 15 minutos pero se **renueva solo** con el refresh token (14 días) mientras sigas usando la aplicación. Solo vuelves al login si dejas de usarla el tiempo suficiente para que caduque también el refresh, o si haces logout.

### ¿Puedo cerrar la sesión en todos los dispositivos?
Sí: cambia tu contraseña en **Mi cuenta**. Al hacerlo se revocan todos tus refresh tokens, así que las sesiones abiertas en cualquier otro dispositivo dejan de valer. Lo mismo ocurre cuando un administrador cambia la contraseña o el rol de alguien.

### ¿Por qué el frontend no guarda el token en localStorage?
Porque cualquier script inyectado podría leerlo. Los tokens viven en **cookies httpOnly**, invisibles para JavaScript. Por eso el frontend nunca manipula tokens directamente.

### "Demasiados intentos. Prueba de nuevo más tarde."
Se han fallado 10 inicios de sesión (o códigos de verificación) en 15 minutos desde tu IP. Espera a que pase la ventana. Los intentos correctos no cuentan, así que un usuario que entra bien nunca se bloquea.

---

## Verificación en dos pasos

### ¿Cómo la activo?
En **Mi cuenta → Verificación en dos pasos → Activar verificación en dos pasos**:

1. Escanea el QR con tu app autenticadora.
2. Escribe el código de 6 dígitos que muestra la app y pulsa **Verificar y activar**.
3. Guarda los 8 códigos de recuperación.

Paso a paso en [USER_GUIDE.md § A.7](USER_GUIDE.md#a7-tu-cuenta-y-su-seguridad).

### ¿Qué app necesito?
Cualquiera compatible con TOTP: Google Authenticator, Microsoft Authenticator, 1Password, Authy, Bitwarden… MCLog no envía SMS ni correos.

### El código dice "Código incorrecto o caducado" y lo acabo de leer
Casi siempre es la **hora del móvil**: los códigos se calculan con el reloj, y el servidor solo tolera 30 segundos de diferencia. Activa la hora automática del teléfono. Si no, puede que ese código ya lo hayas usado: cada código vale **una sola vez**, así que espera al siguiente.

### "El intento de inicio de sesión ha caducado"
Entre la contraseña y el código pasaron más de 5 minutos. Pulsa **Volver** y escribe de nuevo la contraseña.

### He perdido el móvil
Entra con uno de tus **códigos de recuperación**, en el mismo campo que el código de 6 dígitos (da igual si lo escribes con guion o sin él). Después, en **Mi cuenta**, desactiva la verificación y vuelve a activarla con el móvil nuevo.

### He perdido el móvil y los códigos de recuperación
Pide ayuda al administrador del servicio. A propósito, un admin **no puede** quitar la verificación de otra cuenta desde el dashboard: si pudiera, bastaría con robar una sesión de admin para tomar cualquier cuenta. El procedimiento de recuperación está en la [guía de operación del backend](../Back_MCLog/docs/USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

### Me quedan pocos códigos de recuperación
Desactiva la verificación y vuelve a activarla: obtendrás 8 códigos nuevos y los anteriores dejarán de valer.

### ¿Afecta a las API keys o al acceso de la IA?
No. La verificación en dos pasos protege el inicio de sesión de las personas. Las API keys, incluidas las que usa un asistente de IA por MCP, siguen funcionando igual.

### ¿Cómo sé quién la tiene activada?
En **Plataforma → Cuentas**, esas cuentas llevan la etiqueta **2FA**.

---

## Errores concretos

### `401 Invalid or missing API key`
La cabecera `x-api-key` falta, la clave no existe, está revocada o ha caducado. Compruébala en **Espacio → API keys** (columna **Estado**), verifica que no haya espacios sobrantes y que estés apuntando al entorno correcto: la clave de desarrollo no vale en producción.

### `403` al consultar logs teniendo API key
La clave no tiene el permiso `read`. Es a propósito: **una clave de ingesta no da acceso de lectura**, y es lo que hace que una clave filtrada no exponga los logs. Para leer, crea una clave con permiso **Consultar logs y errores**.

### `403` al enviar un log
La clave no tiene permiso `ingest`, o está acotada a otras aplicaciones. La respuesta trae `allowedApplications` con las permitidas: revisa el campo `application` que envías.

### `400` con una lista de `errors`
Validación. La respuesta indica el campo exacto:

```json
{ "status": "error", "errors": { "level": { "msg": "Level must be one of: debug, info, warn, error" } } }
```

Causas habituales: falta un obligatorio, `level`/`environment` con un valor fuera del enum, `metadata` enviada como array en vez de objeto, o `timestamp` que no es ISO-8601.

### `409` al crear un snapshot
El espacio llegó al tope de snapshots vigentes (**Snapshots por espacio** en la configuración de la plataforma, 100 por defecto). Borra los que ya no hagan falta en la página **Snapshots**; los caducados no cuentan aunque todavía aparezcan en la lista.

### Un enlace de snapshot dice "no existe o ha caducado"
Lo borraron, caducó, el enlace llegó cortado, no eres miembro de su espacio, o es público y la cuenta root apagó los **Snapshots públicos**. MCLog responde lo mismo en todos los casos a propósito: así un enlace no confirma nada a quien no debe verlo.

### `403 Requires role: admin` / `403 Requires workspace owner`
El primero: gestionar cuentas (`/auth/users`) requiere el rol `admin` de plataforma. El segundo: purgar, claves, alertas, miembros o el Lab requieren ser **dueño** del espacio indicado en `X-Workspace-Id` (el admin de plataforma lo es de todos).

### `403 The root account cannot be deleted` (o `demoted`)
Intentaste eliminar o quitar el rol de admin a la cuenta root. No se puede, a propósito: ver [¿Qué es la cuenta root?](#qué-es-la-cuenta-root).

### `429 Too Many Requests`
Superaste el rate limit. Hay tres independientes:

| Límite | Por defecto | Suele significar | Variable |
|---|---|---|---|
| Ingesta | 2000/min por clave | Hay que agrupar en lotes | `INGEST_RATE_LIMIT_MAX` |
| Consulta | 600 cada 15 min | Un script en bucle | `RATE_LIMIT_MAX` |
| Login | 10 fallos cada 15 min por IP | Contraseña o código repetidamente mal | `LOGIN_RATE_LIMIT_MAX` |

### `503 degraded` en `/health`
La API responde pero **no alcanza la base de datos**. Revisa que el contenedor esté arriba (`docker compose ps`) y que `DATABASE_URL` sea correcta.

### El dashboard dice "No pudimos cargar los logs"
1. ¿Responde la API? `curl http://localhost:3000/health`
2. ¿Está bien `NEXT_PUBLIC_API_URL` en `frontend_mclog/.env.local`? En una imagen Docker se fija **al compilar**: cambiarla exige reconstruir.
3. ¿Está el origen del dashboard en `CORS_ORIGINS` del backend, **exacto**? `http://localhost:3001` y `http://localhost:3001/` no son lo mismo.

Abre la consola del navegador: un error de CORS se ve ahí explícitamente.

### El backend no arranca y se queja de la configuración
```
Configuración insegura para producción:
 - API_KEY sigue con un valor de ejemplo
```
Es **intencional**. Con `NODE_ENV=production`, el servicio se niega a arrancar en cualquiera de estos casos:

- quedan secretos o contraseñas de ejemplo (`API_KEY`, `JWT_*_SECRET`, `ADMIN_PASSWORD`);
- los dos secretos JWT son iguales;
- `CORS_ORIGINS` está vacío.

Configura el `.env` (o las variables de tu plataforma). En un orquestador se ve como un contenedor que **se reinicia en bucle**.

### Una migración falla con `string contains embedded null`
El `.sql` se guardó en UTF-16 (le pasa a PowerShell con `>` y `Out-File`). Vuelve a guardarlo en **UTF-8**.

### La sesión se cae constantemente en producción
Las cookies no se están guardando. Con el dashboard y la API en dominios distintos:

- Si comparten dominio raíz (`mclog.tu-dominio.com` y `api-mclog.tu-dominio.com`), basta HTTPS con `COOKIE_SECURE=1` y `COOKIE_SAMESITE=lax`.
- Si son de sitios distintos, necesitas `COOKIE_SAMESITE=none`, y aun así algunos navegadores bloquean esas cookies.

Detalle en [DEPLOYMENT.md § B.5](DEPLOYMENT.md#b5-dos-dominios-cors-y-cookies).

---

## Alertas

### ¿Cómo me entero de que algo falla sin estar mirando el dashboard?
Con una **regla** de alerta y un **canal**, en Espacio → Alertas. Las reglas se comprueban cada minuto.

### ¿Qué puede dispararse?
Dos cosas: que se acumulen N coincidencias en una ventana (**umbral**), o que aparezca un error **que no se había visto nunca**. La segunda es la más útil justo después de un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes".

### ¿Por dónde avisa?
Webhook (vale para Slack, Discord, Teams o n8n), correo y Telegram. Una regla puede usar varios a la vez, y hay un botón de envío de prueba en cada canal.

### ¿Cómo sé que un webhook viene de MCLog?
Pon un **secreto** al crear el canal: cada aviso viaja firmado con HMAC-SHA256 en la cabecera `x-mclog-signature`. El receptor recalcula la firma sobre el cuerpo y compara.

### Me va a inundar de avisos
Para eso está el **silencio tras avisar** de cada regla. Tras dispararse, calla el tiempo que indiques; sin él, un incidente de una hora generaría sesenta avisos idénticos. El silencio arranca aunque el envío falle, a propósito.

### Un canal ha fallado, ¿me entero?
Sí. En Espacio → Alertas → Historial cada disparo muestra a cuántos canales se entregó y el motivo de los que fallaron. Un canal caído no impide avisar por los demás.

### ¿Hace falta configurar algo para el correo?
Solo para ese canal: las variables `SMTP_*` del backend. Webhook y Telegram se configuran enteros desde el dashboard.

### ¿Cómo pruebo una regla sin esperar a un fallo real?
Con el Lab. **Pico de incidente** dispara las reglas de umbral y **Error nuevo** las de tipo "Error nuevo". Elige como entorno de destino el mismo que filtra tu regla. Guía: [Configurar alertas](guias/configurar-alertas.md).

---

## El Lab

### ¿Qué es el Lab?
Una pantalla de la sección **Espacio** (solo para su dueño) con escenarios de prueba que envían **logs reales** a MCLog y te llevan a donde se ve el resultado: agrupación de errores, trazas, picos, alertas, enmascarado de datos y el stream en vivo. Sirve para comprobar que todo funciona, para enseñar el producto o para probar una regla de alerta.

### ¿Ensucia mis datos?
Poco, y se limpia fácil:

- Todo lo que envía va a aplicaciones que empiezan por `lab-`.
- Por defecto va al entorno **Desarrollo**, así que no cuenta en las métricas ni en las alertas de producción.
- **Borrar datos del lab** elimina todos esos logs y nada más.

### ¿Por qué no lo veo en el menú?
Es solo para administradores.

### ¿Necesito una API key para usarlo?
No: envía con tu propia sesión. Pero el panel **Petición** del **Log a medida** te da el cURL equivalente con `<TU_API_KEY>`, para que lo uses desde fuera con una clave de permiso ingest.

### ¿Puedo enviar a producción?
Sí, eligiendo **Producción** en **Entorno de destino**. La pantalla te avisa: esos logs contarán en las métricas y pueden disparar alertas reales.

---

## Acceso para IA

### ¿Cómo conecto Claude Code (o Cursor) a mis logs?
Creas una API key con permiso `read` y la registras como servidor MCP. Los pasos, con la configuración de cada cliente, están en [AI_INTEGRATION.md](AI_INTEGRATION.md).

### ¿Qué puede hacer la IA con mis logs?
Solo leer, y solo lo que alcance su clave. Dispone de ocho herramientas: inventario de aplicaciones, errores agrupados por causa, búsqueda con filtros, detalle de un log, errores recientes, traza completa, contexto alrededor de un log y estadísticas.

### ¿Puede escribir o borrar algo?
No. Una clave con permiso `read` no puede escribir logs ni purgar nada, y el endpoint MCP nunca asigna rol de administrador, así que las operaciones de administración le quedan fuera aunque las pidiera.

### ¿Por qué los errores aparecen agrupados?
Porque el mismo fallo casi nunca tiene el mismo mensaje: lleva dentro el id del pedido, un UUID o una hora. MCLog normaliza esa parte variable y calcula una huella, de modo que cuatrocientas ocurrencias de un timeout son un grupo con un 400 al lado en vez de cuatrocientas líneas indistinguibles.

### ¿Tengo que cambiar cómo envío los logs?
No es obligatorio, pero mejora mucho el resultado mandar la excepción entera en el campo `error` en lugar de solo su mensaje. Con la clase del error y el stack la agrupación es precisa. Ver [AI_INTEGRATION.md § 5](AI_INTEGRATION.md#5-que-los-logs-merezcan-la-pena).

---

## Operación y rendimiento

### La base de datos crece sin parar, ¿qué hago?
Baja la retención en **Plataforma → Configuración** (cuenta root): los logs se conservan entre **3 meses y 5 años**, 3 meses por defecto (`RETENTION_MONTHS`). El servicio purga cada hora los más antiguos que esa ventana, en lotes de 5000 filas para no bloquear la tabla ni competir con la ingesta. También limpia los refresh tokens caducados.

No hay opción de "no borrar nunca": la tabla no debe crecer sin límite. Sigue existiendo `DELETE /api/logs?before=<fecha>` para purgas puntuales.

Con varias instancias detrás de un balanceador, deja `SCHEDULER_ENABLED=1` en una sola: varias purgas a la vez compiten por las mismas filas sin aportar nada.

### ¿Cuántos logs aguanta?
Con los índices actuales, PostgreSQL maneja cómodamente decenas de millones de filas. A partir de ahí conviene **particionar por rango de `timestamp`**, con la ventaja de que la purga pasa a ser un `DROP PARTITION` instantáneo. La ruta completa de escalado está en [ARCHITECTURE.md](ARCHITECTURE.md#rendimiento-y-escalabilidad).

### ¿Puedo levantar varias instancias de la API?
Sí: sesiones, claves y logs viven en PostgreSQL. Ponlas detrás de un balanceador con `TRUST_PROXY=1`, con tres salvedades:

- El rate limiting es por instancia (está en memoria), así que el límite efectivo se multiplica por el número de instancias.
- `SCHEDULER_ENABLED=1` debe quedar en una sola.
- El stream en vivo es por instancia.

### ¿Cómo hago backup?
- **Con el despliegue de Docker Compose de `deploy/`**: ya hay un servicio `backup` que hace un volcado diario y conserva los de los últimos 14 días; ver [DEPLOYMENT.md](DEPLOYMENT.md#copias-de-seguridad).
- **En desarrollo, a mano**:

  ```bash
  docker compose exec db pg_dump -U postgres mclog > backup_$(date +%F).sql
  ```

- **En CapRover**: [DEPLOYMENT.md § Copias en la opción B](DEPLOYMENT.md#copias-de-seguridad-en-la-opción-b).

En todos los casos, **lleva las copias fuera del servidor**.

### ¿Cómo monitorizo el propio servicio?
`GET /health` para uptime checks (verifica también la base) y `GET /metrics` con una clave de permiso `metrics` para Prometheus. Además el servicio escribe una línea JSON por petición con `requestId`, `traceId`, status y duración (salvo los `/health` correctos, para no ahogar el resto).

### ¿Puedo rotar una clave sin cortar el servicio?
Sí, si usas claves creadas desde el dashboard: creas la nueva, actualizas al emisor y revocas la vieja. Durante ese rato las dos funcionan.

La excepción es la clave heredada de la variable `API_KEY`: es única, y cambiarla deja fuera a todos los emisores que aún la usen hasta que los actualices. Es una razón más para migrar a claves con permisos.

---

## Despliegue

### ¿Dónde lo despliego?
Hay dos caminos documentados en [DEPLOYMENT.md](DEPLOYMENT.md):

- **Un VPS con Docker Compose y Caddy**: todo en un servidor y bajo un dominio. Es lo más simple.
- **CapRover para la API y la base, y Railway para el dashboard**, cada uno en su dominio.

### CapRover devuelve `502 Bad Gateway` pero la app está bien
Casi siempre es el **Container HTTP Port** de la app en CapRover, que sigue en `80`. La API escucha en el `3000`: cámbialo en **HTTP Settings**. El síntoma inequívoco es que los logs de la app dicen `Server is running` y su healthcheck da 200, pero desde fuera hay 502.

### El contenedor de la API se reinicia en bucle
Mira sus logs: si aparece "Configuración insegura para producción", la lista de debajo dice qué variable falta o conserva un valor de ejemplo. Si usas `FORCE_HTTPS=1` con una imagen antigua, el healthcheck interno recibía `400`; las versiones actuales lo resuelven.

### Con el dashboard y la API en dominios distintos, ¿qué tengo que configurar?
Tres cosas:

- En la API, `CORS_ORIGINS` con el origen exacto del dashboard.
- En el dashboard, `NEXT_PUBLIC_API_URL` al compilar.
- En la API, las cookies (`COOKIE_SECURE=1` y el `COOKIE_SAMESITE` adecuado).

Ver [DEPLOYMENT.md § B.5](DEPLOYMENT.md#b5-dos-dominios-cors-y-cookies).

### `unable to get local issuer certificate` al desplegar desde la oficina
Un proxy corporativo intercepta TLS. Apunta `NODE_EXTRA_CA_CERTS` al certificado raíz de tu empresa para `caprover` y `npm`, o usa `NODE_OPTIONS=--use-system-ca` (Node 22.15+). **Nunca** desactives la verificación con `NODE_TLS_REJECT_UNAUTHORIZED=0`: enviarías tus credenciales sin comprobar a quién.

---

## Seguridad

### ¿Qué pasa si se filtra una API key?
Depende de sus permisos, que es precisamente por lo que existen:

- **Una clave `ingest`**: el atacante puede **escribir logs falsos**, pero **no puede leer nada**. Es una molestia, no una fuga de datos.
- **Una clave `read`**: sí expone los logs de sus aplicaciones.

En los dos casos, **revócala** en **Espacio → API keys**; el efecto es inmediato. Crea una nueva y actualiza al emisor.

### ¿Qué pasa si roban un refresh token?
El daño está acotado por la **rotación**: cada refresh token se invalida al usarse (con un margen de 30 segundos para las peticiones simultáneas del propio dashboard). Si el usuario legítimo lo usa antes que el atacante, el robado queda inservible. Para cortar de raíz, el usuario cambia su contraseña en **Mi cuenta**, que revoca todas sus sesiones; o un admin borra las filas de `RefreshToken` de ese usuario.

### ¿Las contraseñas están cifradas?
Están **hasheadas** con bcrypt (coste 12), que no es reversible. Nadie —ni el administrador ni quien tenga acceso a la base— puede leer una contraseña; solo restablecerla. Los códigos de recuperación del 2FA y las API keys también se guardan solo como hash.

### ¿Qué pasa si roban mi contraseña?
Si tienes la [verificación en dos pasos](#verificación-en-dos-pasos) activa, no basta para entrar: también hace falta el código de tu móvil. Cambia la contraseña en **Mi cuenta** en cuanto puedas; eso cierra todas tus sesiones abiertas.

### ¿Hay riesgo de SQL injection?
No por construcción: Prisma parametriza todas las consultas, y el campo de ordenación se valida contra una lista blanca en vez de interpolarse.

### ¿Se registran datos sensibles en los logs del servicio?
Con `LOG_LEVEL=debug` se registra el body de las peticiones, pero **redactando** `password`, `token`, `authorization`, `auth`, `refreshtoken` y `accesstoken`.

Cuidado con lo que tú mandas: si pones una contraseña o un token en el `message` o en `metadata` de un log tuyo, se guardará tal cual. MCLog no puede adivinar qué es secreto dentro de tu propio contenido.

### ¿Se puede restringir qué aplicación envía con cada clave?
Sí. Al crear una clave en **Espacio → API keys** puedes limitarla a una lista de aplicaciones. La restricción vale en los dos sentidos: esa clave no puede escribir logs de otra aplicación (responde `403`) ni verlos al consultar, ni en el listado, ni en las estadísticas, ni pidiendo un log concreto por su id, que responde `404` para no confirmar siquiera que existe.

Cada clave lleva además permisos: `ingest` para escribir, `read` para consultar y `metrics` para Prometheus. Una clave de ingesta filtrada no expone nada de lo ya almacenado.

La clave única de la variable `API_KEY` sigue funcionando por compatibilidad con los emisores ya desplegados, con permisos de ingesta y métricas. Está **deprecada**: no la uses para integraciones nuevas.

---

## Desarrollo

### ¿Cómo levanto todo en local?
[USER_GUIDE.md § C.1](USER_GUIDE.md#c1-arranque-local). Resumen: `docker compose up -d db`, `npx prisma migrate deploy`, `npm run dev` en el backend y en `frontend_mclog`.

### ¿Cómo ejecuto los tests?
```bash
cd Back_MCLog && docker compose up -d db && npm test    # 238 tests en 19 suites
cd frontend_mclog && npm test                           # 46 tests
cd packages/mclog && npm test               # 95 tests
node integrations/netsuite/test_mclog_client.js         # 40 comprobaciones
node integrations/netsuite/test_lib_mclog.js            # 114 comprobaciones
```
Los del backend necesitan la base real en `localhost:5435` y corren en serie porque la comparten.

### ¿Por qué el puerto de PostgreSQL es 5435 y no 5432?
Para no chocar con otra instancia de PostgreSQL en tu máquina. Dentro de Docker el puerto sigue siendo 5432; el 5435 es solo el mapeo al host.

### ¿Por qué `DATABASE_URL` es distinta dentro y fuera de Docker?
Dentro de la red de Compose los contenedores se ven por nombre de servicio: `db:5432`. Desde tu máquina hay que usar el puerto publicado: `localhost:5435`. Por eso el comando de migraciones en local lleva la `DATABASE_URL` por delante.

### ¿Dónde está la documentación de la API para probarla?
En `http://localhost:3000/docs` — Swagger UI, con los endpoints ejecutables desde el navegador.

### ¿Cómo añado un campo nuevo al log?
1. Añádelo a `model Log` en [schema.prisma](../Back_MCLog/prisma/schema.prisma).
2. `npx prisma migrate dev --name add_campo` (guarda el `.sql` en UTF-8).
3. Añade su regla en [validateLog.ts](../Back_MCLog/src/middlewares/validateLog.ts).
4. Propágalo en `toCreateInput` de [logController.ts](../Back_MCLog/src/controllers/logController.ts).
5. Si debe ser filtrable, añádelo a `buildWhere` en [logService.ts](../Back_MCLog/src/services/logService.ts) y a [validateLogQuery.ts](../Back_MCLog/src/middlewares/validateLogQuery.ts).

Antes de hacerlo, considera si te basta con meterlo en `metadata`: no requiere migración ni tocar código.

### ¿Cómo publico una versión nueva de la librería?
```bash
cd packages/mclog
npm version patch          # o minor / major
npm publish                # prepublishOnly ejecuta build + tests
```
Requiere estar autenticado en npm con acceso a la organización `multicomputos-srl`.
