# Proteger tu cuenta

Cambia tu contraseña, activa la verificación en dos pasos, guarda tus códigos de recuperación y aprende qué hacer si pierdes el móvil o quieres eliminar tu cuenta.

## Qué vas a conseguir

- Una contraseña que solo conoces tú.
- La **verificación en dos pasos (2FA)** activa: aunque alguien robe tu contraseña, no podrá entrar sin tu móvil.
- Tus **códigos de recuperación** guardados, por si pierdes el móvil.

## Antes de empezar

- Tu usuario y contraseña del dashboard.
- Un móvil con una **app autenticadora**: Google Authenticator, Microsoft Authenticator, 1Password, Authy, Bitwarden… Cualquiera compatible con **TOTP** vale. MCLog no usa SMS.
- Un sitio seguro para guardar 8 códigos: un gestor de contraseñas, o papel en un lugar seguro.

Todo se hace en **Mi cuenta**, abajo en el menú de la izquierda.

## Paso 1 — Cambia tu contraseña

Hazlo siempre que te hayan dado la contraseña otra persona o un fichero de configuración.

1. En **Mi cuenta**, busca la tarjeta **Cambiar contraseña**.
2. Escribe tu **Contraseña actual**.
3. Escribe la **Contraseña nueva** (mínimo 8 caracteres y distinta de la actual) y repítela en **Repite la contraseña nueva**.
4. Pulsa **Cambiar contraseña**.

Verás "Contraseña actualizada. Se han cerrado todas tus sesiones". MCLog cierra la sesión **en todos tus dispositivos, incluido este**, y te lleva al login. Entra con la contraseña nueva.

> [!TIP]
> Cambiar la contraseña es también la forma de **cerrar la sesión en todos los dispositivos**, por ejemplo si te dejaste la sesión abierta en un ordenador ajeno.

## Paso 2 — Activa la verificación en dos pasos

1. En **Mi cuenta**, tarjeta **Verificación en dos pasos** (debe decir **Desactivada**), pulsa **Activar verificación en dos pasos**.
2. **Escanea el código QR**:
   - Abre tu app autenticadora y añade una cuenta nueva ("+", "Añadir cuenta" o "Escanear código QR").
   - Apunta la cámara al QR de la pantalla.
   - La app añade una entrada llamada **MCLog** con tu correo.

   Si no puedes escanear, pulsa el botón de copiar junto a **"¿No puedes escanearlo? Introduce esta clave a mano:"** y pega la clave en la opción "Introducir clave" de la app. Elige el tipo **basado en tiempo**.
3. La app muestra un código de **6 dígitos** que cambia cada 30 segundos. Escríbelo en **Código de verificación**.
4. Pulsa **Verificar y activar**. El botón se habilita al completar los 6 dígitos.

> [!NOTE]
> Si el código no se acepta, espera al siguiente y vuelve a probar. Si sigue fallando, revisa que la **hora del móvil sea automática**: los códigos dependen del reloj.

## Paso 3 — Guarda tus códigos de recuperación

Justo después aparece la ventana **Guarda tus códigos de recuperación**, con **8 códigos** como `a1b2c-3d4e5`.

1. Pulsa **Copiar**.
2. Pégalos en tu gestor de contraseñas, o imprímelos y guárdalos en un lugar seguro. **Fuera del móvil**: son para cuando no lo tengas.
3. Pulsa **Ya los he guardado**.

> [!WARNING]
> **No se vuelven a mostrar.** Cada código sirve **una sola vez** para entrar sin el móvil. Si los pierdes a la vez que el móvil, solo un administrador con acceso a la base de datos podrá recuperar tu cuenta.

La tarjeta pasa a **Activada**.

## Paso 4 — Comprueba que funciona

1. Cierra la sesión (menú de usuario → **Cerrar sesión**).
2. Entra con tu correo y contraseña.
3. Aparece **Verificación en dos pasos**: escribe el código de tu app y pulsa **Verificar**.

Tienes **5 minutos** entre la contraseña y el código. Si pasan, verás "El intento de inicio de sesión ha caducado": pulsa **Volver** y empieza de nuevo.

## Si pierdes el móvil

**Tienes los códigos de recuperación:**

1. En el login, tras la contraseña, escribe **uno de tus códigos de recuperación** en el campo **Código de verificación**. Da igual si lo escribes con guion o sin él, en mayúsculas o minúsculas.
2. Pulsa **Verificar**. Ese código ya no volverá a valer.
3. En **Mi cuenta**, pulsa **Desactivar**, escribe tu **Contraseña actual** y **otro** código de recuperación en **Código de la app o de recuperación**, y confirma.
4. Vuelve al [paso 2](#paso-2--activa-la-verificación-en-dos-pasos) con el móvil nuevo. Recibirás 8 códigos nuevos.

**No tienes los códigos:** pide ayuda al administrador del servicio. Desde el dashboard no puede quitarte la verificación, a propósito: si pudiera, bastaría con robar la sesión de un admin para entrar en cualquier cuenta. El procedimiento está en la [guía de operación del backend](../../Back_MCLog/docs/USER_GUIDE.md#recuperar-una-cuenta-con-2fa).

## Cambiar de móvil

Con el móvil viejo todavía a mano:

1. **Mi cuenta → Desactivar**, con tu contraseña y el código del móvil viejo.
2. Actívala de nuevo escaneando el QR con el móvil nuevo ([paso 2](#paso-2--activa-la-verificación-en-dos-pasos)).
3. Guarda los códigos nuevos: los anteriores ya no valen.

## Desactivar la verificación en dos pasos

**Mi cuenta → Verificación en dos pasos → Desactivar**. Escribe tu **Contraseña actual** y un **Código de la app o de recuperación**, y confirma. Tu cuenta queda protegida solo por la contraseña.

## Eliminar tu cuenta

En la tarjeta **Zona de peligro**:

1. Pulsa **Eliminar mi cuenta**.
2. En **Confirma con tu contraseña**, escribe tu contraseña.
3. Si tienes la verificación en dos pasos, escribe un código de la app o de recuperación.
4. Escribe **ELIMINAR** en el último campo.
5. Pulsa **Eliminar definitivamente**.

Se borra tu usuario, se cierran todas tus sesiones y vuelves al login. **No se puede deshacer.** Las API keys que creaste siguen funcionando (un admin puede revocarlas en Administración → API keys).

> [!NOTE]
> La **cuenta root** del servicio no se puede eliminar: en su lugar verás "Esta es la cuenta root del servicio: no se puede eliminar". Tampoco se puede eliminar la cuenta del **último administrador**.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| "Código incorrecto o caducado." | Espera al siguiente código. Activa la hora automática del móvil. Recuerda que un código ya usado no vuelve a valer |
| "El intento de inicio de sesión ha caducado. Vuelve a introducir tu contraseña." | Pasaron más de 5 minutos: **Volver** y empezar de nuevo |
| "Demasiados intentos. Prueba de nuevo más tarde." | 10 intentos fallidos en 15 minutos desde tu red. Espera |
| No aparece el botón **Activar verificación en dos pasos** | Ya está activa (la tarjeta dice **Activada**). Para empezar de cero, desactívala primero |
| Al eliminar la cuenta: error de contraseña o código | Revisa la contraseña, y que el código sea el actual |

## Siguiente paso

- Si eres administrador: [Administrar usuarios y claves](administrar-usuarios-y-claves.md), y pide a los demás admins que activen también la verificación (la etiqueta **2FA** en **Usuarios** te dice quién la tiene).
