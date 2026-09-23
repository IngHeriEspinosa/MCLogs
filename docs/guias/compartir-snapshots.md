# Compartir un snapshot

Enseña a otra persona lo que estás viendo en Logs o Registros con un enlace: a tu equipo o a alguien de fuera que no tiene cuenta.

## Qué vas a conseguir

- Un enlace que abre una **copia congelada** de la vista: el resumen (métricas, actividad, niveles, entornos, fallos principales) y la tabla de logs, con su detalle.
- Elegir **quién** puede verlo: solo tu equipo, o cualquiera con el enlace.
- Decidir **cuánto** dura, y borrarlo cuando quieras.

> [!NOTE]
> Un snapshot guarda los **datos**, no la búsqueda. Lo que ve quien abre el enlace es lo que había al crearlo, aunque después lleguen logs nuevos o la retención borre los originales. Si lo que quieres es que alguien de tu equipo abra la misma búsqueda con datos actuales, comparte la URL de la página ([Buscar registros](buscar-registros.md), paso 5).

## Antes de empezar

- Ser miembro del espacio. Cualquier miembro crea snapshots **de equipo**.
- Para los **públicos** hay que ser el **dueño** del espacio y que la cuenta root no los haya desactivado en **Plataforma → Configuración** (**Snapshots públicos**).

## Paso 1 — Deja la vista como quieres enseñarla

1. Abre **Logs** o **Registros**.
2. Elige el rango de tiempo y los filtros. En Registros también cuenta la búsqueda avanzada.
3. El orden de la tabla también se guarda.

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

El diálogo te avisa si los logs no caben todos: se guardan como mucho 500 (lo ajusta la cuenta root en **Logs por snapshot**), los primeros en el orden de la tabla. El resumen, en cambio, cuenta todos.

## Paso 3 — Envía el enlace

Pulsa **Copiar enlace** y pégalo donde quieras, o **Abrir** para ver lo que verá la otra persona.

Quien lo abre ve:

- El título, cuándo se capturó, cuándo caduca y los filtros usados.
- El resumen, con la ayuda de cada métrica en su icono.
- La tabla, que puede ordenar y paginar, y el detalle de cada log con las flechas ← →.

No puede pasar de ahí: en un snapshot no hay contexto, traza ni "similares", porque llevarían a datos en vivo.

Si alguien sin sesión abre uno **de equipo**, se le pide entrar y, al hacerlo, vuelve al snapshot. Si no es miembro del espacio, verá "Este snapshot no existe o ha caducado", igual que con un enlace inventado.

## Paso 4 — Gestiona tus snapshots

En el menú, **Observabilidad → Snapshots** lista los del espacio: título, visibilidad, autor, cuándo se creó, cuándo caduca y cuántas veces se ha abierto.

- **Copiar** vuelve a copiar el enlace.
- **Borrar** lo quita al momento, para todos. Puede borrarlo quien lo creó o el dueño del espacio.

Los caducados dejan de abrirse en cuanto vence la fecha y se borran solos en menos de una hora.

> [!IMPORTANT]
> Apagar **Snapshots públicos** en la configuración de la plataforma corta **también los ya creados**: dejan de abrirse hasta que se vuelva a encender. Es el interruptor para dejar de exponer datos de golpe.

## Problemas comunes

| Síntoma | Causa |
|---|---|
| La opción **Público** tiene un candado | No eres el dueño del espacio, o los públicos están desactivados en la plataforma |
| El enlace dice "no existe o ha caducado" | Lo borraron, caducó, el enlace está incompleto o no eres miembro de su espacio |
| Faltan logs en la tabla | Se superó el tope de **Logs por snapshot**; el aviso de la página dice cuántos se guardaron |
| Veo `[REDACTED:…]` | Es un snapshot público: los datos sensibles se enmascaran siempre |
