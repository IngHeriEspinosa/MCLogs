# Buscar registros

Encuentra exactamente los logs que buscas: filtros rápidos, búsqueda libre y búsqueda avanzada campo por campo, y cómo compartir o exportar el resultado.

## Qué vas a conseguir

- Saber qué filtro usar para cada pregunta.
- Hacer búsquedas precisas con la **búsqueda avanzada** de **Registros**.
- Leer los resultados a pantalla completa y recorrerlos con el teclado.
- Compartir la búsqueda con un enlace y exportarla a CSV o NDJSON.

## Antes de empezar

- Un usuario del dashboard (cualquier rol).
- Conviene saber la diferencia entre las dos pantallas de tabla:

| Pantalla | Para qué |
|---|---|
| **Logs** | Vigilar: resumen, gráfico de actividad, modo **En vivo** y exportación |
| **Registros** | Buscar y leer: solo la tabla, con **búsqueda avanzada** y el detalle a pantalla completa |

## Paso 1 — Abre Registros

En el menú, **Observabilidad → Registros**.

Si ya estás en **Logs** con unos filtros puestos, usa el icono junto al número de registros de la tabla ("Abrir en Registros"): se abre Registros **con los mismos filtros**.

## Paso 2 — Acota con los filtros rápidos

La barra de arriba es la misma que en Logs:

| Filtro | Úsalo para |
|---|---|
| **Rango de tiempo** | Rangos rápidos (**Últimos 15 minutos** … **Últimos 30 días**, **Todo el histórico**) o un rango a medida en el calendario, con hora de inicio y de fin |
| **Buscar** | Un texto que aparezca **en cualquier sitio**: mensaje, aplicación, servicio, host o traceId. La tecla <kbd>/</kbd> te lleva directo aquí |
| **Nivel** | Solo errores, solo warnings… |
| **Entorno** | Producción, Staging o Desarrollo |
| **Aplicación** | Lista con buscador; también admite escribir parte de un nombre |

> [!TIP]
> El **rango de tiempo** es el filtro que más se queda puesto sin querer. Si no ves lo que esperabas, amplíalo primero.

## Paso 3 — Afina con la búsqueda avanzada

Debajo de la barra está la tarjeta **Búsqueda avanzada** (si está plegada, haz clic en su título). Cada campo busca **solo en su campo** del log:

| Campo | Busca en | Ejemplo |
|---|---|---|
| **Mensaje contiene** | El mensaje | `timeout` |
| **Servicio** | El servicio | `checkout` |
| **Host** | La máquina o instancia | `web-01` |
| **Trace ID exacto** | El traceId | el id **completo** |
| **Nombre del error** | La clase de la excepción | `TypeError` |
| **Código de error** | El código del error | `ECONNRESET` |

Cómo funciona:

1. Escribe en uno o varios campos. Los resultados se actualizan solos al dejar de escribir.
2. **Todos los campos se combinan con Y**, y además con los filtros de arriba.
3. Todos buscan **texto parcial** y sin distinguir mayúsculas, **salvo Trace ID exacto**, que tiene que ser el id entero.
4. El número junto a **Búsqueda avanzada** te dice cuántos campos tienes activos.
5. Para vaciarlos, pulsa **Limpiar búsqueda avanzada**. Ojo: **Limpiar filtros** (arriba) **no** los toca.

**Ejemplo:** "¿Qué `ECONNRESET` ha tenido el servicio `checkout` en producción esta semana?"

- Rango **Últimos 7 días**, Entorno **Producción**, Nivel **Error**.
- **Servicio**: `checkout`.
- **Código de error**: `ECONNRESET`.

Con **Buscar** no podrías hacer esa pregunta: `checkout` coincidiría también con mensajes que solo mencionan la palabra.

## Paso 4 — Lee los resultados

1. Haz clic en un registro: se abre **a pantalla completa**, con el mensaje, las acciones, el stack y la metadata a la izquierda, y las propiedades y el contexto a la derecha.
2. Pasa al siguiente o al anterior con **Registro siguiente** / **Registro anterior**, o con las flechas <kbd>←</kbd> <kbd>→</kbd>. Arriba ves en cuál estás ("3 de 20 en esta página").
3. <kbd>Esc</kbd>, o un clic fuera del detalle, lo cierra.

En la cabecera de la tabla eliges el **orden** (fecha, aplicación, nivel, host o entorno), la **densidad** (cómoda o compacta) y cuántos registros por página.

## Paso 5 — Comparte la búsqueda

Todos los filtros, incluida la búsqueda avanzada, están en la **URL** del navegador. Cópiala y pégala en un chat o un ticket: quien la abra verá exactamente los mismos resultados, y podrá seguir filtrando desde ahí.

## Paso 6 — Exporta

La exportación está en la pantalla **Logs**, botón **Exportar**, y respeta los filtros activos. Para exportar una búsqueda hecha en Registros, copia su URL y cambia `/records` por `/logs`: los filtros se conservan.

| Formato | Úsalo para | Nota |
|---|---|---|
| **CSV** | Excel u hojas de cálculo | Sin metadata ni campos de error |
| **NDJSON** | Procesarlo con herramientas (`jq`, scripts) | El registro completo, un JSON por línea |

Cada descarga trae **hasta 10 000 registros**. Para más, divide el rango de fechas y haz varias.

## Comprueba que funcionó

- La URL cambia al escribir en los filtros.
- Al abrir esa URL en otra pestaña ves los mismos resultados.
- El número junto a **Búsqueda avanzada** coincide con los campos que rellenaste.

## Si algo falla

| Síntoma | Solución |
|---|---|
| "No hay registros que coincidan" | Amplía el **rango de tiempo**; luego revisa **Entorno** y **Nivel**; después, los campos de la búsqueda avanzada (el número junto al título dice cuántos hay activos) |
| Trace ID no encuentra nada | Tiene que ser el id **completo**, sin espacios. Para una búsqueda parcial usa **Buscar** |
| **Nombre del error** o **Código de error** no encuentra nada | Esos campos solo existen si la aplicación envía la excepción entera ([INTEGRATION.md](../INTEGRATION.md#manda-la-excepción-no-solo-su-mensaje)). Prueba con **Mensaje contiene** |
| Quité los filtros y siguen saliendo pocos resultados | **Limpiar filtros** no borra la búsqueda avanzada ni el rango: usa **Limpiar búsqueda avanzada** y amplía el rango |

## Siguiente paso

- [Investigar un incidente](investigar-incidente.md): el recorrido completo, empezando por Errores.
- Para búsquedas desde un script, la misma búsqueda existe en la API: [INTEGRATION.md § Consulta programática](../INTEGRATION.md#consulta-programática-opcional).
