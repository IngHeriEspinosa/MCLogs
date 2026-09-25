# Compartir un snapshot

Enseña a otra persona lo que estás viendo en Logs, Registros, Errores o una Traza con un enlace: a tu equipo o a alguien de fuera que no tiene cuenta.

## Qué vas a conseguir

- Un enlace que abre una **copia congelada** de la pantalla:
  - **Logs** o **Registros**: el resumen (métricas, actividad, niveles, entornos, fallos principales) y la tabla de logs, con su detalle.
  - **Errores**: las tarjetas y la tabla de fallos agrupados, con el ejemplo más reciente de cada fallo (**Ver ejemplo**).
  - **Traza**: los totales de la operación y su línea temporal, paso a paso.
- Una vista previa con el título y las cifras cuando pegas el enlace en Slack, WhatsApp o Teams.
- Elegir **quién** puede verlo: solo tu equipo, o cualquiera con el enlace.
- Decidir **cuánto** dura, y borrarlo cuando quieras.

> [!NOTE]
> Un snapshot guarda los **datos**, no la búsqueda. Lo que ve quien abre el enlace es lo que había al crearlo, aunque después lleguen logs nuevos o la retención borre los originales. Si lo que quieres es que alguien de tu equipo abra la misma búsqueda con datos actuales, comparte la URL de la página ([Buscar registros](buscar-registros.md), paso 5).

## Antes de empezar

- Ser miembro del espacio. Cualquier miembro crea snapshots **de equipo**.
- Para los **públicos** hay que ser el **dueño** del espacio y que la cuenta root no los haya desactivado en **Plataforma → Configuración** (**Snapshots públicos**).

## Paso 1 — Deja la vista como quieres enseñarla

1. Abre **Logs**, **Registros**, **Errores** o la **Traza** que quieres enseñar.
2. Elige el rango de tiempo y los filtros. En Registros también cuenta la búsqueda avanzada; en Errores, el nivel (errores o warnings).
3. En Logs y Registros también se guarda el orden de la tabla.

Un rango relativo, como **Últimas 24 horas**, se fija al crear el snapshot: pasan a ser las 24 horas hasta ese momento.

## Paso 2 — Pulsa Compartir

1. Arriba a la derecha, pulsa **Compartir**.
2. Revisa el **Título**. Se propone uno con el rango y la aplicación; pon algo que diga qué se enseña ("Caída de facturación del martes").
3. En **Quién puede verlo** elige:

| Opción | Quién lo abre | Datos |
|---|---|---|
| **Equipo** | Solo los miembros del espacio, con su sesión. Quien salga del espacio deja de verlo | Tal cual |
| **Público** | Cualquiera con el enlace, sin cuenta | **Enmascarados**: correos, IPs, tokens, contraseñas y claves se tapan antes de guardarse. No se muestra el nombre del espacio |

4. En **Caduca** elige 1 día, 7 días, 30 días o **Nunca**.
5. Pulsa **Crear enlace**.

El diálogo te dice qué se guardará. En Logs y Registros, como mucho 500 logs (lo ajusta la cuenta root en **Logs por snapshot**), los primeros en el orden de la tabla; el resumen, en cambio, cuenta todos. En Errores, los fallos distintos que ves (hasta 100) con un ejemplo de cada uno. En una Traza, sus registros (con el mismo tope); los totales cuentan la operación entera.

Cada espacio puede tener a la vez hasta 100 snapshots vigentes (**Snapshots por espacio**; los caducados no cuentan). Al llegar al tope, el diálogo lo dice: borra alguno que ya no haga falta.

## Paso 3 — Envía el enlace

Pulsa **Copiar enlace** y pégalo donde quieras, o **Abrir** para ver lo que verá la otra persona.

Al pegarlo en Slack, WhatsApp o Teams, un snapshot **público** muestra una tarjeta con el título, el tipo y las cifras principales. Uno **de equipo** sale como tarjeta genérica, sin título: quien pide la vista previa no tiene sesión, y de un snapshot privado no debe salir nada.

Quien lo abre ve:

- El título, cuándo se capturó, cuándo caduca y los filtros usados.
- El resumen, con la ayuda de cada métrica en su icono.
- La tabla, que puede ordenar y paginar, y el detalle de cada log con las flechas ← →.

No puede pasar de ahí: en un snapshot no hay contexto, traza ni "similares", porque llevarían a datos en vivo.

Si alguien sin sesión abre uno **de equipo**, se le pide entrar y, al hacerlo, vuelve al snapshot. Si no es miembro del espacio, verá "Este snapshot no existe o ha caducado", igual que con un enlace inventado.

## Paso 4 — Gestiona tus snapshots

En el menú, **Observabilidad → Snapshots** lista los del espacio: título, visibilidad, autor, cuándo se creó, cuándo caduca y cuántas veces se ha abierto.

- El botón **Copiar enlace** (icono) vuelve a copiar el enlace.
- **Borrar** lo quita al momento, para todos. Puede borrarlo quien lo creó o el dueño del espacio.

Los caducados dejan de abrirse en cuanto vence la fecha y se borran solos en menos de una hora.

> [!IMPORTANT]
> Apagar **Snapshots públicos** en la configuración de la plataforma corta **también los ya creados**: dejan de abrirse hasta que se vuelva a encender. Es el interruptor para dejar de exponer datos de golpe.

## Problemas comunes

| Síntoma | Causa |
|---|---|
| La opción **Público** tiene un candado y no se puede elegir | No eres el dueño del espacio, o los públicos están desactivados en la plataforma. El texto bajo la opción dice cuál de las dos |
| "El espacio ya tiene … snapshots vigentes" | Se llegó al tope de **Snapshots por espacio**. Borra los que no hagan falta desde **Snapshots** |
| El enlace dice "no existe o ha caducado" | Lo borraron, caducó, el enlace está incompleto o no eres miembro de su espacio |
| Faltan logs en la tabla | Se superó el tope de **Logs por snapshot**; el aviso de la página dice cuántos se guardaron |
| Veo `[REDACTED:…]` | Es un snapshot público: los datos sensibles se enmascaran siempre |
| El enlace de un público sale en el chat como tarjeta genérica | El servidor del dashboard no llega a la API para la vista previa (ver `API_INTERNAL_URL` en [DEPLOYMENT.md](../DEPLOYMENT.md)), o el chat guardó una vista previa anterior |
