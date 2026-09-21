# MCLog — Conectar una IA a tus logs

MCLog expone un servidor **MCP** (Model Context Protocol) en `/mcp`. Con él, un asistente como Claude Code, Cursor o Claude Desktop consulta tus logs con herramientas propias en lugar de que tú le pegues fragmentos a mano.

La diferencia práctica: en vez de copiar un stack trace al chat, preguntas *"¿qué está fallando en facturación hoy?"* y el asistente lo averigua solo, agrupa las repeticiones, sigue la traza entre sistemas y te dice qué pasó justo antes.

---

## 1. Crear la clave de lectura

En el dashboard, **Administración → API keys → Nueva clave**:

| Campo | Valor |
|---|---|
| Nombre | Algo reconocible, p. ej. `Claude Code — equipo backend` |
| Permisos | Solo **`read`** |
| Aplicaciones | Las que deba ver. Vacío = todas |
| Caducidad | Opcional, recomendable para claves repartidas |

Copia el secreto en ese momento: en la base de datos solo queda su hash, así que **no se puede recuperar después**.

> Dale `read` y nada más. Una clave de lectura no puede escribir logs falsos, ni purgar, ni administrar nada. Si además la acotas a una aplicación, el asistente no verá ni un registro de las demás, tampoco pidiendo un log concreto por su id.

---

## 2. Conectar el asistente

### Claude Code

```bash
claude mcp add --transport http mclog https://mclog.tu-dominio.com/mcp \
  --header "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
```

Comprueba que está vivo con `/mcp` dentro de Claude Code. Para todo el equipo, añade `--scope project`: la configuración se guarda en `.mcp.json` del repositorio y cada persona pone su propia clave.

### Cursor

`.cursor/mcp.json` en el proyecto (o `~/.cursor/mcp.json` para todos):

```json
{
  "mcpServers": {
    "mclog": {
      "url": "https://mclog.tu-dominio.com/mcp",
      "headers": {
        "Authorization": "Bearer mclog_xxxxxxxx_tu-clave"
      }
    }
  }
}
```

### VS Code (GitHub Copilot)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "mclog": {
      "type": "http",
      "url": "https://mclog.tu-dominio.com/mcp",
      "headers": {
        "Authorization": "Bearer mclog_xxxxxxxx_tu-clave"
      }
    }
  }
}
```

### Claude Desktop

Claude Desktop habla por entrada estándar, así que necesita un puente:

```json
{
  "mcpServers": {
    "mclog": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://mclog.tu-dominio.com/mcp",
        "--header", "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
      ]
    }
  }
}
```

> **No metas la clave en un fichero que se versione.** Estos ficheros suelen acabar en el repositorio. Usa la configuración de usuario, o una variable de entorno si tu cliente la soporta.

> Los **conectores de claude.ai en el navegador** exigen OAuth 2.1 y hoy MCLog solo autentica por clave, así que esa vía queda fuera. Las cuatro de arriba cubren el trabajo desde el editor, que es donde se investigan los errores.

---

## 3. Qué puede hacer el asistente

Ocho herramientas, pensadas para el recorrido real de una investigación:

| Herramienta | Para qué |
|---|---|
| `list_applications` | Qué aplicaciones han emitido logs en la última semana (ampliable con `hours`), sus servicios y sus errores de las últimas 24 h |
| `get_error_groups` | **Qué está fallando**, agrupado por causa y ordenado por frecuencia |
| `search_logs` | Buscar con filtros: texto, aplicación, nivel, fechas, traza, huella |
| `get_log` | El registro completo de un log, con stack y metadata |
| `get_recent_errors` | Los últimos errores sin agrupar, para comprobar si algo falla ahora |
| `get_trace` | Una operación completa por `traceId`, cruzando aplicaciones |
| `get_log_context` | Lo ocurrido justo antes y después de un log |
| `get_stats` | Totales y serie por hora, para ver cuándo empezó |

La distinción que más rendimiento da: **`get_error_groups` responde "qué está fallando" y `search_logs` responde "qué ha pasado"**. Veintinueve timeouts del mismo fallo son un grupo con un 29 al lado, no veintinueve líneas. El asistente lo sabe porque está en la descripción de la herramienta.

---

## 4. Cómo preguntar

Van bien las preguntas de investigación, no las de búsqueda literal:

- «¿Qué está fallando en producción en las últimas 6 horas?»
- «El pedido 8891 no se facturó. Busca su traza y dime dónde se rompió.»
- «¿Hay errores nuevos hoy que no aparecieran ayer?»
- «Coge el error más frecuente de facturación, mira su stack y el contexto, y propón un arreglo.»
- «Acabo de desplegar. ¿Ha aparecido algún error nuevo en los últimos 15 minutos?»

Para que lo use por su cuenta al depurar, añade esto al `CLAUDE.md` (o equivalente) de tus proyectos:

```markdown
## Logs de producción

Este proyecto envía sus logs a MCLog, accesible por el servidor MCP `mclog`.

Al investigar un fallo en producción, consúltalo antes de especular:
empieza por `get_error_groups` para ver qué falla y con qué frecuencia,
usa `get_trace` si el problema cruza varios servicios, y `get_log_context`
para ver qué ocurrió justo antes. La aplicación se llama `<nombre>`.
```

### Sin conectar nada: briefs desde el dashboard

Si el asistente no puede usar MCP (un chat web, un modelo de otra empresa, un ticket), el dashboard prepara el contexto por ti:

- **Reportes → Brief para agentes IA** genera un Markdown con instrucciones (rol, objetivo, pasos, reglas y formato de respuesta), las herramientas MCP por si el agente sí puede usarlas, y los datos del rango en bloques YAML, CSV y JSON. **Datos para agentes (JSON)** da lo mismo en un solo objeto con esquema `mclog.agent-report/v1`, para pipelines.
- **Copiar para IA** en el detalle de un log, en un fallo agrupado o en una traza copia un brief más corto de solo eso.

Los datos de los logs van dentro de `<mclog_data>` y las reglas le dicen al agente que ese contenido no son instrucciones: un log que diga "ignora lo anterior" no le cambia la tarea. Por defecto se enmascaran correos, IPs, tokens y claves largas; huellas y traceId se conservan para que el agente pueda citarlos o pedirlos por MCP.

---

## 5. Que los logs merezcan la pena

Las herramientas solo son tan buenas como lo que se les da de comer. Tres cosas cambian el resultado:

**Manda la excepción, no solo su mensaje.** Con la clase del error y el stack, MCLog agrupa las repeticiones del mismo fallo; sin ellos, cada mensaje con un id distinto parece un problema diferente.

```ts
// Node, con @multicomputos-srl/mclog
try { await cobrar(pedido); }
catch (err) { await mclog.captureException(err, { metadata: { pedidoId: pedido.id } }); }
```

```js
// NetSuite
try { crearFactura(); }
catch (e) { appLog.exception('Fallo al crear la factura', e, { recordId: id }); }
```

Sin librería, en cualquier lenguaje, basta un campo `error` en el JSON:

```json
{
  "application": "facturacion",
  "level": "error",
  "environment": "production",
  "message": "Timeout en la pasarela de pagos",
  "traceId": "req-8842",
  "error": { "name": "TimeoutError", "code": "ETIMEDOUT", "stack": "..." },
  "metadata": { "pedidoId": 991 }
}
```

**Propaga el `traceId`** entre servicios. Es lo que convierte logs sueltos en una historia que el asistente puede seguir de punta a punta.

**Pon en `metadata` lo que necesitarías para diagnosticar**: ids de registro, de usuario, parámetros de entrada, tiempos. Compacto: ids y valores, no volcados enteros.

---

## 6. Si algo no funciona

| Síntoma | Causa |
|---|---|
| El cliente no conecta | Comprueba la URL: termina en `/mcp`, sin barra final |
| `401` | La clave no existe, está revocada o ha caducado |
| `403` | La clave no tiene el permiso `read` (probablemente es de ingesta) |
| `405` | Se está usando GET. El endpoint es sin estado y solo acepta POST; los clientes MCP ya lo hacen bien |
| El asistente no ve una aplicación | La clave está acotada a otras. Míralo en Administración → API keys |
| No encuentra nada | ¿Están llegando los logs? Compruébalo en el dashboard antes de culpar al MCP |

Prueba manual del endpoint, sin cliente de por medio:

```bash
curl -s -X POST https://mclog.tu-dominio.com/mcp \
  -H "Authorization: Bearer mclog_xxxxxxxx_tu-clave" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Debe devolver las ocho herramientas.

---

## 7. Qué tener en cuenta

- **Las respuestas van recortadas a propósito.** Los listados no llevan metadata y los mensajes se cortan a 2000 caracteres, porque todo lo que devuelve la herramienta consume contexto del modelo. `get_log` es el que entrega el registro entero.
- **El endpoint no guarda estado.** Cada petición se atiende y se cierra, así que el servicio sigue escalando horizontalmente sin sesiones pegadas a una instancia.
- **La clave manda, no el asistente.** Todos los límites de una API key acotada se aplican dentro de MCP: el modelo no puede pedir lo que su clave no alcanza.
- **Se puede apagar** con `MCP_ENABLED=0` si no quieres exponerlo.

Referencia de la API REST equivalente en [TECHNICAL.md](TECHNICAL.md). Despliegue en [DEPLOYMENT.md](DEPLOYMENT.md).
