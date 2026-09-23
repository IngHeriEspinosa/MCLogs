# Administrar usuarios y claves

Da acceso a las personas de tu equipo y a las máquinas que envían o leen logs, con los permisos justos.

## Qué vas a conseguir

- Dar de alta usuarios, cambiar su rol y su contraseña, y darlos de baja.
- Entender la cuenta **root** y las salvaguardas que impiden quedarse sin administración.
- Crear API keys con permisos y alcance por aplicación, y rotarlas sin cortar el servicio.

## Antes de empezar

- Un usuario con rol **admin**. Si no ves **Administración** en el menú, no lo tienes.
- Idealmente, tu propia cuenta ya protegida con la verificación en dos pasos ([Proteger tu cuenta](seguridad-cuenta.md)).

## Parte 1 — Usuarios

Todo en **Administración → Usuarios**.

### Roles

| Rol | Puede |
|---|---|
| **Usuario** (`user`) | Consultar logs, registros, errores y trazas; generar reportes y exportar; gestionar su propia cuenta |
| **Administrador** (`admin`) | Todo lo anterior, más purgar logs y administrar claves, usuarios, alertas y el Lab |

Da **Usuario** por defecto. Un admin puede borrar datos y crear claves.

### Dar de alta a alguien

1. Pulsa **Nuevo usuario**.
2. **Correo**: el de la persona.
3. **Contraseña**: una temporal de al menos 8 caracteres.
4. **Rol**: normalmente **Usuario**.
5. Pulsa **Crear usuario**. Verás "Usuario … creado. Ya puede iniciar sesión."
6. Pasa la contraseña a la persona **por un canal seguro** (no en el mismo mensaje que el correo), y pídele que la cambie y active la verificación en dos pasos ([Proteger tu cuenta](seguridad-cuenta.md)).

### Cambiar el rol o la contraseña de alguien

En la fila del usuario:

- **Rol**: elige el nuevo en el selector. Se aplica de inmediato.
- **Cambiar contraseña**: escribe la nueva (mín. 8) y confirma. Verás "Contraseña actualizada. Sus sesiones abiertas se han cerrado."

Las dos operaciones **cierran las sesiones abiertas** de esa persona en todos sus dispositivos.

### Dar de baja a alguien

Pulsa **Eliminar** en su fila y confirma con **Sí, eliminar**. Sus sesiones dejan de valer al instante. Las API keys que creó siguen funcionando: revísalas en la parte 2.

### Las etiquetas y las salvaguardas

| Etiqueta | Significa |
|---|---|
| **Root** | La cuenta de arranque del servicio (`ADMIN_EMAIL`). Su rol no se puede cambiar y no tiene botón **Eliminar** |
| **2FA** | Esa persona tiene activada la verificación en dos pasos |
| **tú** | Tu propia cuenta |

El backend rechaza, a propósito:

- **Eliminarte a ti mismo** desde esta pantalla (para eso está **Mi cuenta → Zona de peligro**).
- **Eliminar o degradar la cuenta root.**
- **Dejar el servicio sin ningún administrador**: no puedes eliminar ni degradar al último.

> [!NOTE]
> Un admin **no puede quitar la verificación en dos pasos** de otra persona. Si alguien pierde el móvil y sus códigos de recuperación, sigue la [guía de operación del backend](../../Back_MCLog/docs/USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

### Si olvidan la contraseña

Cámbiasela tú desde **Cambiar contraseña** en su fila. Si quien la olvidó es el único administrador, ver el [FAQ](../FAQ.md#olvidé-la-contraseña-de-un-usuario).

## Parte 2 — API keys

Todo en **Administración → API keys**. Las claves autentican a las **máquinas**: aplicaciones que envían logs, asistentes de IA que los leen, Prometheus.

### Qué permiso dar

| Permiso | En pantalla | Para |
|---|---|---|
| `ingest` | **Enviar logs** | Una aplicación que manda sus logs |
| `read` | **Consultar logs y errores** | Un asistente de IA o un script que lee |
| `metrics` | **Leer métricas Prometheus** | Tu Prometheus |

**Una clave por emisor, con el permiso mínimo.** Una clave `ingest` filtrada solo puede escribir logs basura, no leer nada. Ninguna clave puede administrar el servicio ni purgar logs.

### Crear una clave

1. Pulsa **Nueva clave**.
2. **Nombre**: para reconocerla después, por ejemplo `NetSuite producción` o `Claude Code — equipo backend`.
3. **Permisos**: marca solo el que necesite.
4. **Aplicaciones** (muy recomendable): los nombres de aplicación que podrá usar, separados por comas. Vacío significa todas. La restricción vale en los dos sentidos: no podrá **escribir** logs de otras aplicaciones (`403`) ni **verlos** al consultar.
5. **Caducidad** (opcional): una fecha tras la cual deja de valer. Útil para claves temporales o repartidas.
6. Pulsa **Crear clave**.
7. **Copia la clave ahora.** En la base de datos solo queda su hash: es la única vez que se muestra.
8. Pulsa **Ya la he guardado**.

Entrégala a quien la vaya a usar por un canal seguro, y que la guarde en una variable de entorno o un gestor de secretos, nunca en el código.

### Leer la lista

| Columna | Qué dice |
|---|---|
| **Prefijo** | El principio de la clave, para identificarla sin revelarla |
| **Permisos** / **Aplicaciones** | Lo que puede hacer y dónde |
| **Último uso** | Cuándo se usó por última vez. Una clave que lleva meses sin uso es candidata a revocarse |
| **Caduca** / **Estado** | **Activa**, **Revocada** o **Caducada** |

### Rotar una clave sin cortar el servicio

1. Crea una clave **nueva** con los mismos permisos y aplicaciones.
2. Actualiza el emisor para que use la nueva, y despliégalo.
3. Comprueba en la lista que la nueva tiene **Último uso** reciente.
4. En la vieja, pulsa **Revocar** y confirma con **Sí, revocar**.

Durante ese rato funcionan las dos. Revocar es **inmediato** y no se puede deshacer.

> [!WARNING]
> Si una clave se ha filtrado, **revócala primero** y crea la sustituta después: unos minutos sin logs de ese emisor son mejores que dejar la clave viva.

### La clave heredada `API_KEY`

La variable `API_KEY` del backend es una clave única, anterior a este sistema, con permisos de ingesta y métricas. Está **deprecada**: no se puede acotar por aplicación ni rotar sin cortar a todos los que la usen. Migra esos emisores a claves creadas aquí.

## Comprueba que funcionó

- La persona nueva puede entrar y ve solo las secciones de su rol.
- La aplicación con la clave nueva envía logs (en **Logs**, filtra por su aplicación) y la columna **Último uso** de la clave se actualiza.

## Si algo falla

| Síntoma | Causa |
|---|---|
| No puedo cambiar el rol ni eliminar un usuario | Es la cuenta **root** o el último administrador |
| La persona nueva dice "Credenciales inválidas" | Contraseña mal copiada; cámbiasela desde su fila |
| Un emisor recibe `403` con `allowedApplications` | Su `application` no está en las **Aplicaciones** de la clave |
| Un emisor recibe `401` | Clave revocada, caducada o mal copiada |
| Perdí la clave recién creada | No se puede recuperar: revócala y crea otra |

## Siguiente paso

- [Configurar alertas](configurar-alertas.md).
- [Conectar una IA](conectar-ia.md) con una clave `read`.
