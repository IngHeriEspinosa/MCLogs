# MCLog — Glosario

Términos que aparecen en la documentación, la interfaz y la API. Ordenado alfabéticamente.

---

### Access token
JWT de vida corta (**15 minutos** por defecto) que autoriza cada petición de consulta. Viaja en la cabecera `Authorization: Bearer …` o en la cookie `access_token`. Cuando caduca, el sistema lo renueva solo usando el [refresh token](#refresh-token). → [Refresh token](#refresh-token), [Auto-refresh](#auto-refresh)

### Admin
[Rol](#rol) con permiso para **purgar logs** (`DELETE /api/logs`), además de todo lo que puede hacer un `user`. El primero se crea automáticamente al arrancar con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### API key
Clave secreta que autentica a las **máquinas** que envían logs. Viaja en la cabecera `x-api-key`. Se configura con la variable `API_KEY`.

**Importante:** una API key solo permite **escribir**. Nunca da acceso de lectura, así que una clave filtrada no expone los logs de nadie. → [Ingesta](#ingesta)

### Aplicación (`application`)
Nombre de la aplicación que genera el log. Es el campo principal de agrupación: el filtro del dashboard, las estadísticas y la purga selectiva funcionan sobre él. Máximo 120 caracteres. Convención: una `application` por aplicación real, y usar [`service`](#servicio-service) para los subcomponentes.

### Auto-refresh
Comportamiento por el que, cuando el [access token](#access-token) ha caducado, el servidor **no rechaza la petición**: intenta renovarlo con el [refresh token](#refresh-token) y, si lo consigue, la sirve normalmente y devuelve las cookies actualizadas. Es lo que hace que la sesión del dashboard no se corte mientras estás trabajando.

### Batch (lote)
Envío de varios logs en una sola petición HTTP (`POST /api/logs/batch`), hasta 500 por defecto. Se insertan con un único `INSERT` en base de datos. Es la forma correcta de emitir desde procesos masivos: ETL, workers, Map/Reduce de NetSuite. → [Ingesta](#ingesta)

### bcrypt
Algoritmo de hashing usado para las contraseñas de usuario, con coste 12. Las contraseñas **nunca** se guardan en claro ni son recuperables: solo se pueden restablecer.

### CORS *(Cross-Origin Resource Sharing)*
Mecanismo del navegador que decide si una web puede llamar a una API alojada en otro dominio. En MCLog se controla con `CORS_ORIGINS`, que debe contener la URL **exacta** del dashboard. Es la causa habitual de que el dashboard "no conecte" aunque la API funcione.

### Cookie httpOnly
Cookie que el navegador guarda pero **JavaScript no puede leer**. MCLog guarda ahí los tokens de sesión, de modo que un ataque XSS no puede robarlos. Es también la razón por la que el frontend nunca manipula tokens directamente.

### CSV
Formato de exportación tabular, separado por comas. Se abre directo en Excel. **No incluye la metadata**; si la necesitas, usa [NDJSON](#ndjson-newline-delimited-json). → [Exportación](#exportación)

### Debounce
Espera de 350 ms antes de lanzar la búsqueda mientras escribes en el dashboard. Sin ella se dispararía una consulta por cada tecla pulsada.

### Entorno (`environment`)
Contexto de ejecución del que procede el log: `development`, `staging` o `production`. Es un [enum](#enum) cerrado. Permite separar el ruido de desarrollo de los incidentes reales.

### Enum
Tipo con un conjunto cerrado de valores válidos. En MCLog son enums nativos de PostgreSQL: [`level`](#nivel-level) y [`environment`](#entorno-environment). Un valor fuera de la lista se rechaza con `400`.

### Exportación
Descarga masiva de logs aplicando los filtros activos, en [CSV](#csv) o [NDJSON](#ndjson-newline-delimited-json). Ignora la paginación y devuelve hasta `MAX_EXPORT_ROWS` (10 000) registros.

### Governance
Sistema de NetSuite que limita las unidades de cómputo que puede consumir un script. La librería SuiteScript de MCLog adjunta el **governance restante** en la metadata de cada log — un dato imposible de reconstruir después y muy útil para diagnosticar scripts que mueren a medias.

### Host
Máquina o instancia que generó el log. Si la aplicación no lo envía, el servidor rellena el hostname de la petición. Máximo 255 caracteres.

### Ingesta
La acción de **recibir y almacenar** logs: `POST /api/log` y `POST /api/logs/batch`. Se autentica con [API key](#api-key) (o JWT). Tiene su propio [rate limit](#rate-limit), independiente del de consulta, para que un dashboard intensivo no pueda frenar la entrada de logs.

### JSONB
Tipo de PostgreSQL para almacenar JSON de forma binaria y consultable. Es lo que hay detrás de [`metadata`](#metadata). Permite que cada aplicación adjunte su propia estructura sin migrar la base de datos.

### JWT *(JSON Web Token)*
Token firmado que transporta la identidad del usuario (id, email, [rol](#rol)) y su fecha de caducidad. El servidor solo verifica la firma: no necesita guardar sesiones. MCLog usa dos, con secretos distintos: [access](#access-token) y [refresh](#refresh-token).

### jti *(JWT ID)*
Identificador único de un [refresh token](#refresh-token). Es lo que se guarda en la tabla `RefreshToken` para poder revocarlo. Sin él, un JWT no se podría invalidar antes de que caduque.

### Metadata
Objeto JSON **libre** que la aplicación adjunta al log: ids de registro, usuario, tiempos, stack traces… Es el campo donde suele estar la información que realmente explica un incidente. No tiene esquema fijo; la única regla es que sea un objeto (no un array). → [JSONB](#jsonb)

### Migración
Fichero SQL versionado que modifica el esquema de la base de datos. Se aplican con `npx prisma migrate deploy`, en orden y una sola vez. MCLog tiene cuatro: `0001_init`, `0002_enums_indexes`, `0003_auth`, `0004_perf_indexes`.

> Deben guardarse en **UTF-8**. En UTF-16 el motor falla con `string contains embedded null`.

### NDJSON *(Newline-Delimited JSON)*
Formato de exportación con **un objeto JSON completo por línea**. A diferencia del [CSV](#csv), **incluye la metadata**. Se procesa línea a línea sin cargar el fichero entero en memoria — ideal para `jq` o para ingerirlo en otra herramienta.

### Nivel (`level`)
Severidad del evento. [Enum](#enum) cerrado, de menor a mayor gravedad:

| Nivel | Cuándo usarlo |
|---|---|
| `debug` | Detalle de diagnóstico, normalmente solo en desarrollo |
| `info` | Eventos normales del funcionamiento esperado |
| `warn` | Algo anómalo que no ha impedido continuar |
| `error` | Un fallo real que requiere atención |

### OpenAPI / Swagger
Estándar de descripción de APIs REST. MCLog publica el suyo en `/docs` como interfaz navegable donde se pueden probar los endpoints desde el navegador.

### Paginación
División del resultado en páginas: `page` (número) y `pageSize` (tamaño, 1–200, por defecto 20). La respuesta incluye `total` y `totalPages`. Es obligatoria en las consultas JSON — no existe forma de pedir "todos los logs" de golpe.

### Prisma
ORM que usa el backend para hablar con PostgreSQL. Genera un cliente TypeScript tipado desde `schema.prisma` y **parametriza todas las consultas**, lo que elimina la posibilidad de SQL injection.

### Prometheus
Sistema de recolección de métricas. MCLog expone las suyas (CPU, memoria, event loop) en `/metrics`, protegido con [API key](#api-key).

### Purga
Borrado de logs anteriores a una fecha (`DELETE /api/logs?before=…`), opcionalmente de una sola aplicación. Requiere rol [`admin`](#admin) y una fecha explícita. Es la herramienta de retención: **sin purga periódica la tabla crece sin límite**.

### Rate limit
Tope de peticiones por ventana de tiempo. MCLog tiene **dos independientes**:

| Límite | Default | Aplica a |
|---|---|---|
| `ingestLimiter` | 2000 / minuto | Envío de logs |
| `queryLimiter` | 600 / 15 minutos | Consultas y `/auth` |

Separarlos evita que un dashboard intensivo bloquee la ingesta, o al revés. Al superarlo se responde `429`.

### Refresh token
Token de vida larga (**14 días** por defecto) cuya única función es obtener un [access token](#access-token) nuevo. Se guarda en base de datos por su [`jti`](#jti-jwt-id), lo que permite revocarlo.

**Es de un solo uso:** cada vez que se usa, el anterior se elimina y se emite uno nuevo. Eso se llama [rotación](#rotación-de-tokens).

### Rol
Nivel de permiso de un usuario. `user` puede consultar, buscar, ver estadísticas y exportar; [`admin`](#admin) además puede purgar. Sin sesión → `401`; con sesión pero rol insuficiente → `403`.

### Rotación de tokens
Práctica de invalidar el [refresh token](#refresh-token) anterior cada vez que se usa uno. Si alguien roba un refresh token y la víctima lo usa antes que el atacante, el robado ya no sirve. Es lo que convierte un robo silencioso en un fallo detectable.

### Servicio (`service`)
Subcomponente dentro de una [aplicación](#aplicación-application): un worker, un script concreto, un módulo. Si no se envía, el servidor copia el valor de `application`. Máximo 120 caracteres.

### SpanId
Identificador de una **operación concreta** dentro de una traza. Se usa junto al [traceId](#traceid): el trace es el viaje completo, el span es un tramo. Máximo 128 caracteres.

### Stateless
Propiedad del backend: no guarda nada en memoria entre peticiones, todo el estado vive en PostgreSQL. Por eso se pueden levantar varias instancias detrás de un balanceador sin ninguna configuración adicional.

### SuiteScript
Lenguaje de scripting de NetSuite (basado en JavaScript). MCLog incluye una librería en SuiteScript 2.1 lista para subir al File Cabinet.

### TraceId
Identificador que **correlaciona todos los logs de una misma operación**, aunque haya pasado por varios sistemas. Si la aplicación no lo envía, el servidor genera uno por petición.

Es la herramienta más potente del dashboard: pega un traceId en el buscador y ves la operación completa de principio a fin, en orden y entre sistemas. → [SpanId](#spanid)

### Timestamp
Momento del evento, en ISO-8601. Si la aplicación no lo envía, se usa el momento de la inserción. **Conviene enviarlo** en procesos que acumulan logs para mandarlos después: si no, todos quedarán con la hora del envío en vez de la del suceso real.

### Timing-safe comparison
Comparación de secretos que tarda **lo mismo** coincidan o no. Evita que un atacante deduzca la [API key](#api-key) carácter a carácter midiendo tiempos de respuesta. En MCLog es `crypto.timingSafeEqual`.

### Trust proxy
Ajuste (`TRUST_PROXY=1`) que le dice a Express que confíe en las cabeceras `X-Forwarded-*` de un proxy o balanceador. Sin él, detrás de un proxy todas las peticiones parecen venir de la misma IP y el [rate limit](#rate-limit) se aplica mal.
