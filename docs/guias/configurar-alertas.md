# Configurar alertas

Haz que MCLog te avise por Slack, Teams, Discord, correo o Telegram cuando algo se rompa, sin que nadie tenga que estar mirando el dashboard.

## Qué vas a conseguir

- Un **canal**: por dónde llegan los avisos.
- Una o varias **reglas**: cuándo avisar.
- La comprobación de que funciona, sin esperar a un fallo real.

## Antes de empezar

- Ser **dueño** del espacio (el admin de plataforma lo es de todos).
- Según el canal:

| Canal | Necesitas |
|---|---|
| **Webhook** (Slack, Discord, Teams, n8n…) | La URL de un *incoming webhook* de tu herramienta |
| **Correo** | Que el backend tenga configuradas las variables `SMTP_*` (las pone quien despliega) |
| **Telegram** | Un bot (créalo con @BotFather, que te da el **token**) y el **chat ID** del grupo o persona que recibirá los avisos |

> [!TIP]
> Para que los avisos lleven un enlace que abre el dashboard con los filtros de la regla, el backend necesita `PUBLIC_DASHBOARD_URL`.

## Paso 1 — Crea un canal

1. Abre **Espacio → Alertas**, pestaña **Canales**.
2. Rellena el formulario **Nuevo canal** (está siempre abierto en la pestaña).
3. **Nombre**: por ejemplo `Slack #incidentes`.
4. **Tipo** y sus campos:
   - **Webhook**: pega la **URL**. Opcionalmente pon un **Secreto de firma**: cada aviso viajará firmado con HMAC-SHA256 en la cabecera `x-mclog-signature`, y el receptor podrá comprobar que viene de MCLog.
   - **Correo**: en **Destinatarios**, las direcciones separadas por comas.
   - **Telegram**: el **Token del bot** y el **Chat ID**.
5. Pulsa **Crear canal**.

## Paso 2 — Prueba el canal

En la lista de canales, pulsa **Enviar prueba** en el que acabas de crear.

- "Aviso de prueba entregado." → comprueba que ha llegado a Slack, al correo o a Telegram.
- "No se pudo entregar: …" → el motivo exacto viene detrás de los dos puntos. Ver [Si algo falla](#si-algo-falla).

No sigas hasta que la prueba llegue.

## Paso 3 — Crea una regla

1. Pestaña **Reglas**, formulario **Nueva regla**.
2. **Nombre**: qué vigila, por ejemplo `Errores de facturación en producción`.
3. **Tipo**, uno de dos:

   | Tipo | Avisa cuando | Ideal para |
   |---|---|---|
   | **Umbral de repeticiones** | Hay al menos N coincidencias dentro de la ventana | Picos: "más de 20 errores en 10 minutos" |
   | **Error nuevo** | Aparece un error que **no se había visto nunca** | Justo después de un despliegue: "esto antes no fallaba" |

4. **Filtros**: **Aplicación** (o **Todas**), **Entorno** (o **Todos**) y **Nivel mínimo**: **Solo error** o **Warning y error**.
5. **Umbral** (o **Errores nuevos**) y **Ventana (min)**: cuántas coincidencias y en cuántos minutos.
6. **Silencio tras avisar (min)**: tras disparar, la regla calla este tiempo. Sin él, un incidente de una hora te mandaría sesenta avisos iguales.
7. **Avisar por**: marca uno o varios canales.
8. Pulsa **Crear regla**.

Las reglas se comprueban **cada minuto**.

**Un buen punto de partida:**

| Regla | Tipo | Filtros | Umbral / Ventana | Silencio |
|---|---|---|---|---|
| Errores nuevos en producción | Error nuevo | Entorno Producción, Solo error | 1 en 10 min | 60 min |
| Pico de errores | Umbral | Entorno Producción, Solo error | 20 en 5 min | 30 min |

## Paso 4 — Pruébala con el Lab

No hace falta esperar a un fallo real:

1. Abre **Espacio → Lab**.
2. En **Entorno de destino**, elige **el mismo entorno que filtra tu regla**. Si tu regla vigila Producción, tendrás que elegir Producción: la pantalla te avisará de que esos logs cuentan en las métricas.
3. Ejecuta:
   - **Pico de incidente** para una regla de **Umbral** (envía 80 errores y warnings de `lab-billing` en 5 minutos).
   - **Error nuevo** para una regla de **Error nuevo** (cada ejecución crea una huella nunca vista).
4. Espera **uno o dos minutos**: el aviso debería llegar a tu canal.
5. Al terminar, en el Lab, **Borrar datos del lab** → **Sí, borrar**.

> [!NOTE]
> Si tu regla filtra por **Aplicación**, los logs del Lab (aplicaciones `lab-*`) no coincidirán. Para probarla, crea temporalmente una copia de la regla con **Aplicación: Todas**.

## Paso 5 — Revisa el historial

Pestaña **Historial**: cada disparo con su regla, cuántas coincidencias hubo y "entregado a X de Y canales", con el motivo de los que fallaron. Cada regla muestra también su **Último aviso**.

## Mantenimiento

- **Pausar** una regla o un canal sin borrarlo: usa su interruptor.
- **Editar** un canal (cambió la URL del webhook, hay un destinatario nuevo): pulsa **Editar** en su fila, cambia lo que haga falta y **Guardar**. El tipo no se puede cambiar. Los campos secretos (**Secreto de firma**, **Token del bot**) aparecen vacíos: **déjalos vacíos para conservar el valor guardado**, o escribe uno nuevo para sustituirlo.
- **Un canal caído** no impide avisar por los demás. El silencio arranca **aunque el envío falle**, a propósito: reintentar cada minuto contra un canal caído solo multiplicaría el ruido cuando vuelva.

## Si algo falla

| Síntoma | Solución |
|---|---|
| **Enviar prueba** de un webhook: `HTTP 404` o `403` | La URL está mal o el webhook se revocó en tu herramienta |
| **Enviar prueba** de correo: "no está configurado" | Faltan las variables `SMTP_*` en el backend |
| **Enviar prueba** de Telegram: `chat not found` | El chat ID es incorrecto, o el bot no está en el grupo: añádelo |
| La prueba llega, pero la regla nunca avisa | Revisa los filtros (entorno, aplicación, nivel) y que el umbral se alcance dentro de la ventana. Mira **Último aviso**: si avisó hace poco, está en su silencio |
| Llegan demasiados avisos | Las reglas no se editan: borra la regla y créala con más **Silencio tras avisar** o más **Umbral**, o apágala con su interruptor |
| No aparece la opción **Alertas** | Solo la ve el dueño del espacio |

## Siguiente paso

- [Investigar un incidente](investigar-incidente.md): qué hacer cuando llegue el aviso.
