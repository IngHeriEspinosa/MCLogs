# Probar con el Lab

El Lab envía logs de prueba **reales** a MCLog y te lleva a la pantalla donde se ve el resultado. Sirve para ver cómo funciona todo sin integrar nada, para enseñar MCLog a tu equipo o para probar una regla de alerta.

## Qué vas a conseguir

- Ver en acción la agrupación de errores, las trazas, los picos, las alertas, el enmascarado de datos y el stream en vivo.
- Componer un log a medida y obtener la petición equivalente en JSON y cURL, lista para tu integración.
- Dejarlo todo limpio al terminar.

## Antes de empezar

- Ser **dueño** del espacio (el admin de plataforma lo es de todos). El Lab está en **Espacio → Lab**.
- No hace falta ninguna API key: el Lab envía con tu propia sesión.

> [!NOTE]
> Todo lo que envía el Lab va a aplicaciones cuyo nombre empieza por **`lab-`**, así que se distingue del resto y se borra de una vez.

## Paso 1 — Elige el entorno de destino

Arriba, **Entorno de destino**:

- **Desarrollo** (por defecto, recomendado): los logs no se mezclan con las métricas ni con las alertas de producción.
- **Staging** o **Producción**: solo si quieres probar algo que filtre por ese entorno, como una regla de alerta. Con **Producción** verás un aviso: esos logs cuentan en las métricas y pueden disparar alertas reales.

## Paso 2 — Ejecuta un escenario

Cada tarjeta explica qué envía y, en **Qué verás**, qué mirar después.

1. Pulsa **Ejecutar**.
2. La barra muestra el progreso ("40 de 120"). **Detener** lo corta cuando quieras: lo enviado hasta entonces se queda.
3. Al terminar verás "Enviados N logs." y los enlaces al resultado.
4. Si quieres repetirlo, **Ejecutar otra vez**.

Puedes lanzar **varios escenarios a la vez**. Si sales de la página, los que sigan enviando se detienen.

## Los siete escenarios

| Escenario | Qué envía | Qué mirar | Enlaces |
|---|---|---|---|
| **Tráfico normal** | 120 registros de `lab-gateway`, `lab-billing` y `lab-inventory` repartidos en la última hora: sobre todo info y debug, algún warning y un par de errores | El gráfico de actividad se llena, las tarjetas cambian y la tabla tiene de todo para filtrar | **Ver en Logs**, **Ver en Errores** |
| **Error agrupado** | El mismo timeout 25 veces en `lab-checkout`, cada una con un pedido distinto en el mensaje | En **Errores**, **una sola fila** con 25 ocurrencias: MCLog ignora los datos variables al agrupar | **Ver en Errores**, **Ver en Logs** |
| **Traza distribuida** | 7 logs de una compra que pasa por gateway, auth, inventory y billing con el mismo traceId, y falla en billing | La operación completa en orden, con el salto de ~2 s justo antes del fallo | **Abrir la traza** |
| **Pico de incidente** | 80 errores y warnings de `lab-billing` en los últimos 5 minutos (se queda sin conexiones a la base de datos) | Un pico rojo en **Actividad**. Una regla de umbral debería dispararse en el minuto siguiente | **Ver en Logs**, **Revisar alertas** |
| **Error nuevo** | 3 logs de un fallo con **huella nueva en cada ejecución** | Un grupo nuevo en **Errores**; dispara las reglas de tipo **Error nuevo** | **Ver en Errores**, **Revisar alertas** |
| **Datos sensibles** | 6 logs de `lab-auth` con correos, IPs, tokens Bearer, JWT y contraseñas en claro, todos ficticios | Genera un brief con **Brief para IA** o usa **Copiar para IA** en el detalle de un log: todo eso sale **enmascarado** | **Brief para IA**, **Ver en Logs** |
| **Stream en vivo** | 20 logs de `lab-worker`, uno cada 0,75 s (unos 15 s) | Pulsa **Abrir Logs en otra pestaña**, activa **En vivo** allí, y ejecuta el escenario: los verás llegar uno a uno | **Abrir Logs en otra pestaña** |

> [!TIP]
> Para una demo rápida: **Tráfico normal** → **Error agrupado** → **Traza distribuida**. En dos minutos se ve lo esencial de MCLog.

## Paso 3 — Compón un log a medida

La tarjeta **Log a medida** sirve para probar un caso concreto y, sobre todo, para **obtener la petición exacta** que tiene que hacer tu aplicación.

1. Rellena los campos:
   - **Aplicación**: siempre empieza por `lab-`; escribe el resto (por defecto, `custom`).
   - **Servicio** (opcional), **Nivel**, **Entorno**.
   - **Mensaje** (obligatorio).
   - **Trace ID** (opcional): **Generar** crea uno aleatorio.
2. Despliega **Error y metadata** si quieres simular una excepción:
   - **Clase de error** (por ejemplo `TimeoutError`), **Código** y **Stack trace**.
   - **Metadata (JSON)**: un objeto JSON, por ejemplo `{ "pedidoId": 42 }`. Si no es un objeto válido, verás "No es un objeto JSON válido."
3. A la derecha, el panel **Petición** muestra la llamada en **JSON** o en **cURL**. Cópiala: para usarla desde fuera, cambia `<TU_API_KEY>` por una clave con permiso ingest.
4. Pulsa **Enviar log**. Verás "Log N creado." y el enlace **Ver en Logs**.

## Paso 4 — Limpia

1. Pulsa **Borrar datos del lab**.
2. Confirma con **Sí, borrar**.

Verás "Borrados N logs del lab." Solo se borran las aplicaciones `lab-*`: ninguna otra se toca.

## Comprueba que funcionó

- Tras **Tráfico normal**, en **Logs** con el rango **Última hora** y el entorno que elegiste, hay unos 120 registros nuevos.
- Tras **Error agrupado**, en **Errores**, hay **una** fila de `lab-checkout` con 25 en **Veces**.

## Si algo falla

| Síntoma | Solución |
|---|---|
| No aparece **Lab** en el menú | Solo lo ve el dueño del espacio, y solo si la cuenta root no lo ha apagado en **Plataforma → Configuración → Lab de pruebas** |
| "No se pudo enviar" | La sesión caducó (recarga la página y vuelve a entrar) o la API no responde |
| Los logs no aparecen en Logs | Revisa que el **Entorno** y el **rango de tiempo** de Logs incluyan lo enviado. **Tráfico normal** reparte los logs en la última hora |
| La regla de alerta no se dispara | El entorno de destino tiene que coincidir con el de la regla, y la regla no debe filtrar por una aplicación que no sea `lab-*`. Ver [Configurar alertas](configurar-alertas.md#paso-4--pruébala-con-el-lab) |

## Siguiente paso

- [Investigar un incidente](investigar-incidente.md), usando estos mismos datos para practicar.
- [Integrar una aplicación Node.js](integrar-node.md) o [INTEGRATION.md](../INTEGRATION.md), con la petición que te dio el compositor.
