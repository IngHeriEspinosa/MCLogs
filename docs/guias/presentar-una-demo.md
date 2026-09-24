# Presentar MCLog: guion de una demo

Un guion de **25 minutos más preguntas** para enseñar MCLog a tu departamento, con lo que hay que preparar el día antes, qué pulsar y qué decir en cada paso, y qué hacer si algo falla en directo.

El hilo de la demo es una historia, no una lista de pantallas: *"nos avisan de que algo falla, y en cinco minutos sabemos qué, desde cuándo, dónde y por qué"*. Todos los datos salen del **Lab**, así que no hace falta que ninguna aplicación real esté integrada todavía.

## Qué vas a conseguir

- Que el público entienda en 25 minutos qué problema resuelve MCLog y cómo se usa.
- Que vea el flujo completo: enviar logs → agrupar errores → seguir una traza → recibir una alerta → preguntar a una IA.
- Salir con una decisión concreta: **un piloto con una aplicación real** (por ejemplo, una SuiteApp de NetSuite).

## Antes de empezar

### Lo que necesitas

| Necesitas | Detalle |
|---|---|
| Una instancia de MCLog | La de producción, o una local ([Primeros pasos](primeros-pasos.md)). Con producción, la demo enseña lo mismo que verán después |
| Un usuario **admin** con 2FA activado | El Lab y las alertas son de admin. El 2FA se enseña en el login ([Proteger tu cuenta](seguridad-cuenta.md)) |
| Un canal de alertas que **el público pueda ver** | Un grupo de Telegram o un canal de Slack/Teams al que estén invitados, o que proyectes |
| Un móvil con la app autenticadora | Para el código del login |
| Opcional: Claude Code, Cursor o VS Code con el servidor MCP configurado | Para el paso 8 ([Conectar una IA](conectar-ia.md)). Si no, hay alternativa |
| Opcional: el fichero `integrations/netsuite/mclog_client.js` abierto en un editor | Para el paso 9 |

### Checklist del día antes

Hazlo todo con la misma cuenta y el mismo navegador que usarás en la demo.

1. **Entra** y comprueba que la verificación en dos pasos funciona con tu móvil.
2. **Limpia el Lab**: **Espacio → Lab → Borrar datos del lab → Sí, borrar**. Así los recuentos de la demo salen redondos ("25 ocurrencias", no "73").
3. **Crea el canal de alertas** en **Espacio → Alertas → Canales → Nuevo canal**, pulsa **Enviar prueba** y comprueba que el aviso llega donde el público lo verá ([Configurar alertas](configurar-alertas.md)).
4. **Crea dos reglas**, las dos con **Entorno: Desarrollo** (el Lab envía ahí por defecto) y **Aplicación: Todas**:

   | Nombre | Tipo | Umbral / Ventana | Silencio |
   |---|---|---|---|
   | `Demo · pico de errores` | Umbral de repeticiones | 20 en 5 min | 5 min |
   | `Demo · error nuevo` | Error nuevo | 1 en 10 min | 5 min |

   El silencio corto es para poder repetir la demo el mismo día.
5. **Ensaya el pico**: ejecuta **Pico de incidente** en el Lab y cronometra cuánto tarda el aviso (las reglas se evalúan cada minuto). Luego **Borrar datos del lab** otra vez.
6. **Crea una API key** llamada `demo-netsuite` con permiso **Enviar logs** y **Aplicaciones**: `SuiteApp-Facturacion`. La enseñarás en el paso 9; no hace falta usarla.
7. Si vas a enseñar la IA: comprueba que el asistente responde a «¿Qué aplicaciones envían logs a MCLog?».
8. **Prepara el navegador**: tema claro, idioma español, zoom al 125 %, y estas pestañas abiertas en este orden:
   1. MCLog sin sesión (la primera pantalla es el acceso).
   2. El canal de Telegram/Slack donde llegan los avisos.
   3. Opcional: la terminal con Claude Code, o el editor con `mclog_client.js`.
9. **Plan B**: si la instancia de producción no está disponible el día de la demo, ten MCLog levantado en tu equipo ([Primeros pasos](primeros-pasos.md)) con los mismos pasos 2 a 6 hechos.

> [!TIP]
> Ensaya el guion completo una vez con el reloj delante. La primera vez siempre dura el doble.

## El guion

| Min | Paso | Pantalla |
|---|---|---|
| 0–2 | 1. El problema | Ninguna |
| 2–4 | 2. Entrar | Acceso, 2FA |
| 4–6 | 3. Los logs llegan | Lab → Logs |
| 6–9 | 4. Qué está roto | Errores, detalle del log |
| 9–12 | 5. Dónde se rompió | Traza |
| 12–15 | 6. Que avise solo | Lab → Alertas → Telegram |
| 15–17 | 7. Buscar con precisión | Registros |
| 17–20 | 8. Preguntar a una IA | Reportes / Claude Code |
| 20–23 | 9. Cómo se integra | NetSuite, Log a medida, API keys |
| 23–25 | 10. Cierre | Ninguna |

### Paso 1 — El problema (2 min, sin pantalla)

**Qué decir:**

> Hoy, cuando algo falla, la información está repartida: el Execution Log de cada script de NetSuite, los logs de cada servidor, el correo de quien lo vio. Para reconstruir un incidente hay que abrir varios sitios, y nadie sabe si ese error es nuevo o lleva meses pasando.
>
> MCLog es un servicio nuestro, en nuestro servidor, al que **todas** las aplicaciones mandan sus logs. Agrupa los errores repetidos, sigue una operación entre sistemas, avisa cuando aparece algo nuevo y deja que una IA investigue por nosotros.

No enseñes nada todavía: la pantalla vacía obliga a escuchar.

### Paso 2 — Entrar (2 min)

1. Abre MCLog: la primera pantalla es el acceso.
2. Escribe tu correo y contraseña y pulsa **Entrar**.
3. Aparece **Verificación en dos pasos**: escribe el código del móvil y pulsa **Verificar**.

**Qué decir:** «Cada usuario entra con su cuenta, y los administradores con verificación en dos pasos: una contraseña robada no basta.» Señala el menú de la izquierda: el **selector de espacio** arriba (cada cliente o equipo ve solo lo suyo), **Observabilidad** para investigar y **Espacio** solo para su dueño.

### Paso 3 — Los logs llegan (2 min)

1. **Espacio → Lab**. Explica en una frase: «El Lab envía logs de prueba reales, como los mandaría una aplicación.»
2. En **Tráfico normal**, pulsa **Ejecutar**. Mientras corre: «120 registros de tres servicios en la última hora.»
3. Pulsa **Ver en Logs**.
4. Recorre despacio: las **tarjetas** (registros, errores, warnings; pasa el ratón por el icono de una: «cada cifra explica qué mide»), el gráfico de **Actividad** («arrastro sobre el gráfico y acoto el rango»), la **tabla**.
5. Cambia un filtro (**Nivel: Error**) y señala la URL: «Los filtros van en la dirección: copio el enlace, lo pego en el chat y el otro ve exactamente esto.»
6. Pulsa **Compartir**: «Y si quien lo tiene que ver no tiene cuenta, esto crea una copia con su propio enlace, con los datos sensibles tapados.» No hace falta crearlo.

### Paso 4 — Qué está roto (3 min)

1. Vuelve al Lab y ejecuta **Error agrupado**. «El mismo timeout, 25 veces, cada una con un número de pedido distinto.»
2. Pulsa **Ver en Errores**.

**Qué decir:** «Cada fila es un fallo distinto, no una ocurrencia. Aquí hay **una** fila con 25 al lado, no 25 líneas: MCLog ignora los datos que cambian entre ocurrencias. Y la columna **Actividad** dice cuándo apareció por primera vez: si es reciente, es algo que antes no pasaba, y eso casi siempre apunta al último despliegue.»

3. Pulsa **Ver ocurrencias** y haz clic en una fila.
4. En el detalle, señala en orden: el **mensaje**, el **stack trace** («archivo y línea»), la **metadata** («el pedido con el que falló») y el **contexto** («lo que pasó dos minutos antes y después en la misma aplicación»).

### Paso 5 — Dónde se rompió (3 min)

1. Lab → **Traza distribuida** → **Ejecutar** → **Abrir la traza**.

**Qué decir:** «Una compra pasa por el gateway, la autenticación, el inventario y la facturación. Cuatro sistemas, un mismo identificador de traza. Aquí está la operación entera, en orden.» Señala la pista de la derecha: «Este tramo largo, dos segundos antes del fallo, es donde se fue el tiempo. Eso, mirando cuatro logs por separado, no se ve.»

2. Pulsa una línea para desplegar su detalle.

### Paso 6 — Que avise solo (3 min)

1. Lab → **Pico de incidente** → **Ejecutar**. «80 errores en cinco minutos: la facturación se queda sin conexiones a la base de datos.»
2. Mientras se envía, pulsa **Ver en Logs**: el pico rojo en **Actividad**.
3. Cambia a la pestaña de Telegram/Slack. El aviso llega en el minuto siguiente (lo cronometraste ayer). Si tarda, sigue hablando: enseña **Espacio → Alertas → Reglas** y explica los dos tipos:

   > «**Umbral**: más de N errores en X minutos. **Error nuevo**: algo que no había fallado nunca. La segunda es la más útil después de un despliegue: no dice "esto falla mucho", dice "esto no fallaba antes".»

4. Cuando llegue el aviso, muéstralo y luego **Alertas → Historial**: el disparo, cuántas coincidencias y a qué canales llegó.

### Paso 7 — Buscar con precisión (2 min)

1. **Observabilidad → Registros**.
2. En **Búsqueda avanzada**, escribe **Servicio**: `api` y **Código de error**: `EPOOL` (el del pico de incidente: `PoolExhaustedError`).

**Qué decir:** «El buscador general busca en todo. Aquí cada campo busca en lo suyo, y se combinan: los errores de este código, en este servicio, y nada más.»

3. Haz clic en un registro: se abre a pantalla completa. Pulsa <kbd>→</kbd> dos veces: «Paso de uno al siguiente sin cerrar.»

### Paso 8 — Preguntar a una IA (3 min)

Primero, el problema de la privacidad, porque es lo que van a preguntar:

1. Lab → **Datos sensibles** → **Ejecutar** → **Brief para IA**. Se abre **Reportes** y genera un brief.
2. Señala arriba el contador de valores **enmascarados** y, en la vista previa, un `[REDACTED:email]`.

**Qué decir:** «Estos logs llevan correos, IPs, tokens y contraseñas ficticios. Antes de que salga nada hacia un modelo, MCLog los tapa y te dice cuántos tapó. Lo que sí conserva son los identificadores de pedido y de traza, porque son lo que hace falta para investigar.»

3. Señala la sección **Comparación con el periodo anterior**: «Fallos nuevos, los que empeoran y los que dejaron de aparecer respecto a la ventana anterior.»

Luego, la IA en sí. Elige una de las dos:

- **Con MCP** (si lo preparaste): cambia a Claude Code y escribe: «¿Qué está fallando en lab-checkout en la última hora y cuál es la causa más probable?». Mientras responde: «No le he pegado nada. Consulta MCLog con una clave de solo lectura, acotada a las aplicaciones que le dejemos ver.»
- **Sin MCP**: en el detalle de un log de **Errores**, pulsa **Copiar para IA** y pégalo en el chat de IA que use el departamento. «Es el mismo brief: el log, su stack y su contexto, con lo sensible tapado.»

### Paso 9 — Cómo se integra (3 min)

1. Muestra `mclog_client.js` en el editor, o solo este fragmento en pantalla:

   ```js
   define(['/SuiteScripts/lib/mclog_client'], (mclog) => {
       const appLog = mclog.createLogger({ application: 'SuiteApp-Facturacion', environment: 'production' });

       try {
           crearFactura();
       } catch (e) {
           appLog.exception('Fallo al crear la factura', e, { recordId: id });
       }
   });
   ```

   **Qué decir:** «En NetSuite es un fichero en el File Cabinet y cuatro líneas en el script. `exception` manda la clase del error y el stack, que es lo que permite agrupar. Si MCLog no responde, el script sigue: nunca rompe el negocio. Y en Map/Reduce se manda en lote: 500 logs por llamada, diez unidades de governance.»

2. Para lo que no es NetSuite: Lab → **Log a medida**, rellena un mensaje y señala el panel **Petición** en **cURL**: «Cualquier cosa que haga un POST vale. Esta es la petición exacta.»
3. **Espacio → API keys**: señala la clave `demo-netsuite`. «Cada aplicación tiene su clave, con permiso solo de enviar y acotada a su nombre. Si se filtra, no puede leer nada ni escribir en nombre de otra, y se revoca en un clic.»

### Paso 10 — Cierre (2 min)

**Qué decir:**

> - Es **nuestro**: corre en nuestro servidor, los logs no salen de ahí, y no hay licencias.
> - Con datos reales, la pantalla de **Errores** responde "qué está roto" en un clic, y la de **Traza**, "dónde".
> - La propuesta: un **piloto** con una aplicación. Yo integro la primera SuiteApp esta semana, creo las cuentas y en la próxima reunión vemos sus errores de verdad.

Deja en pantalla la dirección de la documentación y cede la palabra.

## Preguntas que te van a hacer

| Pregunta | Respuesta corta |
|---|---|
| ¿Dónde están los datos? | En nuestro servidor, en PostgreSQL. Nada sale hacia terceros salvo lo que copiemos a una IA, y eso va enmascarado |
| ¿Cuánto cuesta? | El software es MIT y autoalojado. El coste es el servidor donde ya corre y el tiempo de integrar cada aplicación |
| ¿Y el governance de NetSuite? | 10 unidades por llamada. En User Events, una llamada; en Map/Reduce, lotes de 500 logs por llamada |
| ¿Qué pasa si MCLog se cae? | Nada en las aplicaciones: los clientes nunca lanzan errores, registran el fallo y siguen |
| ¿Cuánto tiempo se guardan los logs? | Lo que configuremos (`RETENTION_DAYS`, 30 días por defecto). Se borra solo |
| ¿La IA puede borrar o cambiar algo? | No. Su clave es de solo lectura, acotada a las aplicaciones que decidamos, y no puede administrar nada |
| ¿Quién puede entrar? | Cada persona con su usuario. Los administradores, con verificación en dos pasos. La cuenta root no se puede borrar |
| ¿Sustituye al Execution Log de NetSuite? | No, lo complementa: NetSuite sigue igual; MCLog es donde se ve todo junto y agrupado |
| ¿Puedo verlo con datos de mi aplicación? | Sí: ese es el piloto |

## Si algo falla en directo

| Síntoma | Qué hacer |
|---|---|
| No llega el aviso de Telegram/Slack | Sigue con el guion (enseña **Reglas** e **Historial**); vuelve a la pestaña al final del paso 7. Comprueba que la regla está en **Desarrollo** y con silencio corto |
| El login dice "Demasiados intentos" | Espera 15 minutos o entra desde otra red (datos del móvil). Por eso se ensaya el día antes |
| "No se pudo enviar" en el Lab | La sesión caducó: recarga la página y vuelve a entrar |
| La instancia no responde | Plan B: la instalación local. Es la misma demo con `http://localhost:3001` |
| Claude Code no conecta | Salta a la alternativa sin MCP (**Copiar para IA**) |
| Un escenario ya aparece con datos viejos | Olvidaste limpiar el Lab: pulsa **Borrar datos del lab** y ejecútalo de nuevo; tarda segundos |

## Después de la demo

1. **Borrar datos del lab**, para que no ensucien las métricas.
2. Revoca la clave `demo-netsuite` si no la vas a usar en el piloto.
3. Pausa o borra las dos reglas `Demo · …`, o súbeles el silencio.
4. Envía al departamento: la dirección de la documentación, la guía [Primeros pasos](primeros-pasos.md) para quien quiera probar en su equipo, e [Integrar NetSuite](integrar-netsuite.md) para quien vaya a hacer el piloto.
5. Crea los usuarios de quienes vayan a entrar ([Administrar espacios, usuarios y claves](administrar-usuarios-y-claves.md)).

## Siguiente paso

- [Integrar NetSuite](integrar-netsuite.md): el piloto.
- [Configurar alertas](configurar-alertas.md): las reglas de verdad, con las aplicaciones reales.
