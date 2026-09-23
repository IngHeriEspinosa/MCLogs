# Investigar un incidente

Del aviso "algo falla en producción" a la causa, en seis pasos. No hace falta ser técnico para seguirlos.

## Qué vas a conseguir

- Saber **qué** está fallando, desde **cuándo** y **cuántas veces**.
- Llegar al log concreto, con su stack y su contexto.
- Seguir la operación completa si cruza varios sistemas.
- Preparar un resumen para tu equipo o un brief para un asistente de IA.

## Antes de empezar

- Un usuario del dashboard (cualquier rol vale).
- Que tus aplicaciones ya envíen logs. Si quieres **practicar** con datos de prueba, un admin puede ejecutar en **Espacio → Lab** los escenarios **Error agrupado**, **Traza distribuida** y **Pico de incidente** ([Probar con el Lab](probar-con-el-lab.md)).

> [!TIP]
> Empieza siempre por **Errores**, no por Logs. Logs responde "qué ha pasado"; Errores responde "qué está roto", que es lo que quieres saber.

## Paso 1 — Abre Errores y acota

1. En el menú, abre **Errores**.
2. Arriba, en el rango de tiempo, elige **Últimas 24 horas** (o lo que abarque el incidente).
3. En **Entorno**, elige **Producción**.
4. Deja seleccionado **Errores** (junto a **Warnings**).

Cada fila es **un fallo distinto**, no una ocurrencia: si el mismo timeout pasó 29 veces, verás una fila con **29** en la columna **Veces**.

## Paso 2 — Encuentra al sospechoso

Mira las cuatro cifras de arriba (**Fallos distintos**, **Ocurrencias**, **App más afectada**, **Concentración**) y luego la tabla:

| Columna | Qué te dice |
|---|---|
| **Veces** | Cuántas ocurrencias, y qué parte del total |
| **Fallo** | La clase del error, su código, un mensaje de ejemplo y la huella |
| **Aplicación** | Dónde ocurre, y en qué servicio |
| **Actividad** | La última vez y la **primera** dentro del rango |

**El mejor indicio es una primera aparición reciente**: algo que antes no fallaba. Casi siempre apunta a lo último que se tocó (un despliegue, un cambio de configuración).

> [!NOTE]
> "Primera" es la primera vez **dentro del rango elegido**. Para confirmar que un fallo es nuevo de verdad, amplía el rango a **Últimos 30 días**.

## Paso 3 — ¿Desde cuándo pasa?

1. Pulsa **Ver ocurrencias** en la fila del sospechoso. Llegas a **Logs**, filtrado a ese fallo (verás el aviso "Mostrando solo las ocurrencias de un mismo fallo").
2. Mira el gráfico **Actividad**: la franja roja te dice **cuándo empezó**. Si aparece de golpe a una hora concreta, ahí está el inicio del incidente.
3. **Arrastra sobre el gráfico** para acotar el rango a esa franja, o haz clic en una barra para aislarla.

## Paso 4 — Lee un caso concreto

Haz clic en una fila de la tabla para abrir su detalle:

- **Mensaje** completo.
- **Propiedades**: aplicación, servicio, host, trace ID, error y código.
- **Stack trace**: el archivo y la función exactos. Las líneas de tu propio código aparecen resaltadas.
- **Metadata**: los datos con los que falló (el pedido, el usuario…).
- **Contexto**: lo que pasó en la misma aplicación **dos minutos antes y después**. Muchas veces la causa está en el log de justo antes.

Con el detalle abierto, las flechas del teclado recorren la tabla y van cambiando el detalle.

> [!TIP]
> Si prefieres leer a pantalla completa, abre la misma búsqueda en **Registros** con el icono junto al número de registros. Allí el detalle ocupa casi toda la pantalla y <kbd>←</kbd> <kbd>→</kbd> pasan de un registro al siguiente.

## Paso 5 — Sigue la operación completa

Si el fallo es parte de algo que cruza sistemas (un pedido que pasa por la tienda, el inventario y la facturación), pulsa **Ver traza** en el detalle.

La pantalla **Traza** muestra todos los logs de esa operación en orden, **de todas las aplicaciones**:

- Cada línea lleva el tiempo desde el primer registro y el salto desde el anterior (Δ).
- La pista de la derecha muestra dónde se fue el tiempo: **un tramo largo es un cuello de botella**.
- Pulsa una línea para ver su detalle.

> [!NOTE]
> La traza solo funciona si tus aplicaciones comparten el mismo `traceId` a lo largo de la operación. Ver [Integrar Node.js § paso 8](integrar-node.md#paso-8-opcional--correlaciona-entre-servicios).

## Paso 6 — Comparte lo que has encontrado

Elige según a quién va:

| Para | Cómo |
|---|---|
| **Un compañero** | Copia la **URL** del navegador: lleva todos los filtros, y quien la abra verá exactamente lo mismo |
| **Un ticket** | **Copiar JSON** en el detalle del log |
| **Un asistente de IA** | **Copiar para IA** en el detalle (o el botón ✦ en Errores): un brief en Markdown con el log, su stack y su contexto, **con los datos sensibles enmascarados** |
| **Un informe del incidente** | **Reportes** → **Informe Markdown** (para personas) o **Brief para agentes IA** con el objetivo **Resumen de incidente** |
| **La traza entera** | En Traza, **Descargar .md** o **Copiar para IA** |

Si tu equipo tiene un asistente conectado por MCP ([Conectar una IA](conectar-ia.md)), puedes preguntarle directamente: «¿Qué está fallando en facturación desde las 10:00?».

## Comprueba que lo tienes

Al terminar deberías poder responder:

1. ¿Qué falla? (clase y mensaje del error)
2. ¿Dónde? (aplicación, servicio y línea del stack)
3. ¿Desde cuándo y cuántas veces?
4. ¿Qué pasó justo antes? (contexto o traza)

## Si algo falla

| Síntoma | Solución |
|---|---|
| "Ningún fallo en este rango" y sabes que hay errores | Amplía el **rango de tiempo** y revisa el **Entorno**. Mira también **Warnings** |
| El mismo fallo aparece en varias filas | El emisor manda el error solo en el mensaje, sin clase ni stack. Hay que enviar la excepción entera ([INTEGRATION.md](../INTEGRATION.md#manda-la-excepción-no-solo-su-mensaje)) |
| **Ver traza** no aparece | Ese log no tiene traceId compartido con otros |
| La traza solo tiene un log | Las demás aplicaciones no propagan el mismo traceId |

## Siguiente paso

- [Configurar alertas](configurar-alertas.md): que la próxima vez te avise MCLog, antes que un cliente.
- [Buscar registros](buscar-registros.md): búsquedas más precisas cuando ya sabes lo que buscas.
