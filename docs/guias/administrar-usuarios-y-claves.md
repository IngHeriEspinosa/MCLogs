# Administrar espacios, usuarios y claves

Da acceso a las personas de tu equipo y a las máquinas que envían o leen logs, cada una en su espacio y con los permisos justos.

## Qué vas a conseguir

- Entender los **espacios de trabajo**: qué aíslan y quién ve qué.
- Invitar a personas a tu espacio, cambiar su rol y quitarlas.
- Dar de alta cuentas de la plataforma, con espacio propio o dentro de uno tuyo.
- Crear API keys con permisos y alcance por aplicación, y rotarlas sin cortar el servicio.

## Antes de empezar

- Para la parte de espacio: ser **dueño** del espacio (o admin de plataforma, que lo es de todos). Si en el menú no ves la sección **Espacio**, en ese espacio eres miembro.
- Para la parte de plataforma: ser **admin de plataforma**. Si no ves la sección **Plataforma**, no lo eres.
- Idealmente, tu propia cuenta ya protegida con la verificación en dos pasos ([Proteger tu cuenta](seguridad-cuenta.md)).

## Cómo funcionan los espacios

Un **espacio de trabajo** es un entorno aislado: sus logs, API keys y alertas solo los ven sus miembros. Cada cuenta puede pertenecer a varios espacios y cambia de uno a otro con el **selector** de arriba a la izquierda, que muestra el espacio activo y tu rol en él.

| Rol en el espacio | Puede |
|---|---|
| **Miembro** | Ver toda la observabilidad del espacio: logs, registros, errores, trazas y reportes, exportar y crear [snapshots](compartir-snapshots.md) de equipo (y borrar los suyos) |
| **Dueño** | Todo lo anterior, más administrar el espacio: miembros, API keys, alertas y el Lab, purgar logs, crear snapshots públicos y borrar cualquier snapshot |

Aparte está el rol de **plataforma**:

| Rol de plataforma | Puede |
|---|---|
| **Usuario** | Nada más: lo que haga depende de su rol en cada espacio |
| **Admin de plataforma** | Administra la aplicación entera: da de alta y de baja cuentas y es **dueño de todos los espacios**, aunque no sea miembro de ellos. Los ve todos en el selector |

Cualquier cuenta puede crear espacios nuevos desde el selector (**Crear espacio**) y queda como su dueña. Es la forma de separar, por ejemplo, un cliente de otro.

> [!NOTE]
> Al actualizar a esta versión, todo lo que existía (logs, claves y alertas) pasa al espacio **Principal**. Los admins quedan como dueños y el resto de cuentas como miembros. Si alguien no debía ver esos datos, quítalo desde **Espacio → Miembros**.

## Parte 1 — Miembros de tu espacio

Todo en **Espacio → Miembros**, con el espacio que quieras administrar seleccionado.

### Invitar a alguien

1. En **Invitar a alguien**, escribe su **Correo**.
2. Elige el **Rol**: normalmente **Miembro**.
3. Pulsa **Invitar**.

Lo que pasa depende de si la persona ya tiene cuenta:

| Caso | Resultado |
|---|---|
| Ya tiene cuenta | Entra al momento: verá el espacio en su selector. Si hay correo configurado, recibe un aviso |
| No tiene cuenta y hay correo configurado | Recibe un enlace para **elegir su contraseña**. Aparece en la lista con la etiqueta **Pendiente** |
| No tiene cuenta y **no** hay correo | Verás el enlace en pantalla con **Copiar enlace**. Pásaselo por un canal seguro |

El enlace caduca en **7 días** y solo sirve una vez. Nadie más conoce la contraseña que elija. Mientras esté pendiente, la cuenta no puede iniciar sesión.

### Cambiar el rol o quitar a alguien

En la fila de la persona:

- **Rol**: elige **Miembro** o **Dueño**. Se aplica de inmediato.
- **Nuevo enlace** (solo pendientes): genera otro enlace de activación e invalida el anterior.
- **Quitar**: deja de ver el espacio al momento. Si era una invitación pendiente y no está en ningún otro espacio, su cuenta se borra.

En tu propia fila el botón es **Salir**. Un miembro también puede salir desde el selector (**Salir del espacio**).

> [!IMPORTANT]
> Un espacio necesita siempre **al menos un dueño**: el último no puede salir ni dejar de serlo. Haz dueña a otra persona antes.

### Renombrar o borrar el espacio

- **General → Nombre**: lo ven todos los miembros en el selector.
- **Zona de peligro → Borrar espacio**: escribe el nombre exacto para confirmar. El espacio desaparece al instante para todos, sus API keys dejan de funcionar y sus logs se purgan en segundo plano. **No se puede deshacer.**

## Parte 2 — Cuentas de la plataforma

Todo en **Plataforma → Cuentas**. Solo lo ve el admin de plataforma.

### Dar de alta una cuenta

1. Pulsa **Nueva cuenta** y escribe el **Correo**.
2. En **Espacio de trabajo**, elige:
   - **Espacio propio**: la cuenta estrena un espacio vacío del que es dueña. Puedes darle nombre; si no, se llama "Espacio de …".
   - **Unirse a un espacio**: entra a cualquier espacio existente (como admin de plataforma los administras todos), con el rol que elijas.
3. **Rol en la plataforma**: normalmente **Usuario**.
4. Pulsa **Crear cuenta**.

La persona recibe el enlace de activación por correo o, si no hay correo configurado, lo ves en pantalla para compartirlo, igual que en una invitación.

### Leer la lista

| Columna / etiqueta | Qué dice |
|---|---|
| **Espacios** | Los espacios en los que está y su rol en cada uno. Pulsa uno para abrir sus miembros: como admin de plataforma administras todos |
| **Pendiente** | Aún no ha activado la cuenta con su enlace |
| **Root** | La cuenta de arranque del servicio (`ADMIN_EMAIL`). Su rol no se puede cambiar y no tiene botón **Eliminar** |
| **2FA** | Tiene activada la verificación en dos pasos |
| **tú** | Tu propia cuenta |

**Cambiar contraseña** y **Eliminar** funcionan como antes. Las dos operaciones cierran las sesiones abiertas de esa persona.

### Salvaguardas

El backend rechaza, a propósito:

- **Eliminarte a ti mismo** desde esta pantalla (para eso está **Mi cuenta → Zona de peligro**).
- **Eliminar o degradar la cuenta root.**
- **Dejar la plataforma sin ningún admin**.
- **Eliminar una cuenta que es la única dueña de un espacio con más miembros**: antes hay que hacer dueño a otro miembro. Los espacios en los que la cuenta estaba sola se borran con ella.

> [!NOTE]
> Un admin **no puede quitar la verificación en dos pasos** de otra persona. Si alguien pierde el móvil y sus códigos de recuperación, sigue la [guía de operación del backend](../../Back_MCLog/docs/USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

## Parte 3 — API keys

Todo en **Espacio → API keys**. Las claves autentican a las **máquinas**: aplicaciones que envían logs, asistentes de IA que los leen, Prometheus.

**Cada clave pertenece al espacio en el que se crea.** Lo que envía entra en ese espacio y lo que consulta sale de él, diga lo que diga la petición. Para enviar logs a otro espacio, crea la clave desde ese espacio.

### Qué permiso dar

| Permiso | En pantalla | Para |
|---|---|---|
| `ingest` | **Enviar logs** | Una aplicación que manda sus logs |
| `read` | **Consultar logs y errores** | Un asistente de IA o un script que lee |
| `metrics` | **Leer métricas Prometheus** | Tu Prometheus |

**Una clave por emisor, con el permiso mínimo.** Una clave `ingest` filtrada solo puede escribir logs basura en su espacio, no leer nada. Ninguna clave puede administrar un espacio ni purgar logs.

### Crear una clave

1. Comprueba en el selector que estás en el espacio correcto.
2. Pulsa **Nueva clave**.
3. **Nombre**: para reconocerla después, por ejemplo `NetSuite producción` o `Claude Code — equipo backend`.
4. **Permisos**: marca solo el que necesite.
5. **Aplicaciones** (muy recomendable): los nombres de aplicación que podrá usar, separados por comas. Vacío significa todas las del espacio. La restricción vale en los dos sentidos: no podrá **escribir** logs de otras aplicaciones (`403`) ni **verlos** al consultar.
6. **Caducidad** (opcional): una fecha tras la cual deja de valer.
7. Pulsa **Crear clave**.
8. **Copia la clave ahora.** En la base de datos solo queda su hash: es la única vez que se muestra.
9. Pulsa **Ya la he guardado**.

Entrégala a quien la vaya a usar por un canal seguro, y que la guarde en una variable de entorno o un gestor de secretos, nunca en el código.

### Leer la lista

| Columna | Qué dice |
|---|---|
| **Prefijo** | El principio de la clave, para identificarla sin revelarla |
| **Permisos** / **Aplicaciones** | Lo que puede hacer y dónde |
| **Último uso** | Cuándo se usó por última vez. Una clave que lleva meses sin uso es candidata a revocarse |
| **Caduca** / **Estado** | **Activa**, **Revocada** o **Caducada** |

### Rotar una clave sin cortar el servicio

1. Crea una clave **nueva** con los mismos permisos y aplicaciones, en el mismo espacio.
2. Actualiza el emisor para que use la nueva, y despliégalo.
3. Comprueba en la lista que la nueva tiene **Último uso** reciente.
4. En la vieja, pulsa **Revocar** y confirma con **Sí, revocar**.

Durante ese rato funcionan las dos. Revocar es **inmediato** y no se puede deshacer.

> [!WARNING]
> Si una clave se ha filtrado, **revócala primero** y crea la sustituta después: unos minutos sin logs de ese emisor son mejores que dejar la clave viva.

### La clave heredada `API_KEY`

La variable `API_KEY` del backend es una clave única, anterior a este sistema, con permisos de ingesta y métricas. Escribe en el espacio de la cuenta root (**Principal**). Está **deprecada**: no se puede acotar por aplicación ni rotar sin cortar a todos los que la usen. Migra esos emisores a claves creadas aquí.

## Parte 4 — Configuración de la plataforma (solo root)

En **Plataforma → Configuración**. Solo la ve la cuenta root. Aquí se fijan los límites que afectan a todos los espacios:

| Ajuste | Para qué |
|---|---|
| **Miembros por espacio** | Tope de personas por espacio, pendientes incluidas. Al llegar, **Invitar** responde que el espacio está lleno |
| **Invitaciones por día** | Frena el envío masivo: altas por espacio en 24 horas |
| **Validez de una invitación** | Días que vale el enlace de activación (por defecto 7) |
| **Cualquier cuenta puede crear espacios** | Apagado, solo los admins de plataforma crean espacios y el botón **Crear espacio** desaparece para el resto |
| **Espacios por cuenta** | Cuántos espacios puede poseer cada cuenta (los admins no tienen límite) |

En la misma página están la retención de logs, los tamaños de exportación y de lote, las conexiones en vivo, los topes de los snapshots (**Logs por snapshot** y **Snapshots por espacio**), la validez de "olvidé mi contraseña", y los interruptores de MCP, alertas, Lab y **Snapshots públicos** (apagarlo impide crearlos y deja de servir los ya creados). En todos, 0 significa **sin límite** donde se indica. Los cambios se aplican al momento; **Restablecer** vuelve al valor predeterminado.

## Comprueba que funcionó

- La persona invitada ve el espacio en su selector, con su rol, y como miembro no ve la sección **Espacio**.
- Una cuenta con espacio propio no ve ningún log tuyo.
- La aplicación con la clave nueva envía logs (en **Logs**, filtra por su aplicación) y la columna **Último uso** de la clave se actualiza.

## Si algo falla

| Síntoma | Causa |
|---|---|
| No puedo quitar a alguien o cambiar su rol a Miembro | Es el último dueño del espacio |
| **Invitar** dice que el espacio llegó a su límite | La configuración de la plataforma fija un máximo de miembros o de altas por día; pide a la cuenta root que lo suba |
| No aparece **Crear espacio** | La configuración de la plataforma reserva la creación de espacios a los admins |
| No puedo eliminar una cuenta desde **Cuentas** | Es la root, el último admin, o la única dueña de un espacio con más miembros |
| La persona invitada dice "Credenciales inválidas" | Aún no ha activado la cuenta con su enlace; genera uno con **Nuevo enlace** |
| El enlace dice que no es válido o ha caducado | Pasaron 7 días o ya se usó; genera otro con **Nuevo enlace** |
| En **Unirse a un espacio** no aparece ningún espacio | Aún no hay ninguno: crea uno desde el selector |
| Los logs de un emisor no aparecen | La clave es de otro espacio: cambia de espacio en el selector |
| Un emisor recibe `403` con `allowedApplications` | Su `application` no está en las **Aplicaciones** de la clave |
| Un emisor recibe `401` | Clave revocada, caducada, mal copiada, o su espacio se borró |
| Perdí la clave recién creada | No se puede recuperar: revócala y crea otra |

## Siguiente paso

- [Configurar alertas](configurar-alertas.md).
- [Conectar una IA](conectar-ia.md) con una clave `read`.
