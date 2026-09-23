# Conectar una IA

Deja que Claude Code, Cursor, VS Code (Copilot) o Claude Desktop investiguen tus logs por su cuenta, a través del servidor MCP de MCLog.

## Qué vas a conseguir

Preguntarle a tu asistente cosas como «¿qué está fallando en producción hoy?» y que él mismo consulte MCLog: agrupe los errores, siga la traza entre sistemas y mire qué pasó justo antes, sin que le pegues fragmentos a mano.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| Un asistente compatible con MCP por HTTP | Claude Code, Cursor, VS Code con Copilot, o Claude Desktop |
| La URL de tu MCLog | Por ejemplo `https://api-mclog.tu-dominio.com`. El endpoint es `<URL>/mcp` |
| Una **API key con permiso `read`** | El paso 1 explica cómo crearla (hace falta un admin) |

> [!NOTE]
> La conexión usa **solo la clave**. Tu contraseña y tu verificación en dos pasos no intervienen, y el asistente nunca las necesita.

## Paso 1 — Crea una clave de lectura

1. En el dashboard, **Espacio → API keys → Nueva clave**.
2. **Nombre**: quién la usará, por ejemplo `Claude Code — equipo backend`.
3. **Permisos**: solo **Consultar logs y errores**.
4. **Aplicaciones**: las que deba ver el asistente. Vacío significa todas.
5. **Caducidad**: recomendable si la vas a repartir.
6. **Crear clave**, **cópiala** (empieza por `mclog_`) y **Ya la he guardado**.

Con solo `read`, el asistente no puede escribir logs, ni purgar, ni administrar nada. Si la acotas a una aplicación, no verá ni un registro de las demás.

## Paso 2 — Registra el servidor MCP en tu asistente

Sustituye la URL y `mclog_xxxxxxxx_tu-clave` por las tuyas.

### Claude Code

```bash
claude mcp add --transport http mclog https://api-mclog.tu-dominio.com/mcp \
  --header "Authorization: Bearer mclog_xxxxxxxx_tu-clave"
```

### Cursor

En `~/.cursor/mcp.json` (para todos tus proyectos) o `.cursor/mcp.json` (solo este):

```json
{
  "mcpServers": {
    "mclog": {
      "url": "https://api-mclog.tu-dominio.com/mcp",
      "headers": { "Authorization": "Bearer mclog_xxxxxxxx_tu-clave" }
    }
  }
}
```

### VS Code (GitHub Copilot)

En `.vscode/mcp.json`:

```json
{
  "servers": {
    "mclog": {
      "type": "http",
      "url": "https://api-mclog.tu-dominio.com/mcp",
      "headers": { "Authorization": "Bearer mclog_xxxxxxxx_tu-clave" }
    }
  }
}
```

### Claude Desktop

Claude Desktop necesita un puente (`mcp-remote`, requiere Node.js). En su fichero de configuración:

```json
{
  "mcpServers": {
    "mclog": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api-mclog.tu-dominio.com/mcp",
               "--header", "Authorization: Bearer mclog_xxxxxxxx_tu-clave"]
    }
  }
}
```

Reinicia Claude Desktop después de guardar.

> [!WARNING]
> **No subas la clave al repositorio.** `.cursor/mcp.json` y `.vscode/mcp.json` suelen acabar versionados. Usa la configuración de usuario, o una variable de entorno si tu cliente la admite.

## Paso 3 — Comprueba la conexión

- **Claude Code**: escribe `/mcp`. `mclog` debe aparecer como conectado.
- **Cursor / VS Code**: en la configuración de MCP, `mclog` aparece con sus 8 herramientas.
- **Claude Desktop**: el icono de herramientas muestra las de `mclog`.

Luego pregunta algo sencillo: «¿Qué aplicaciones envían logs a MCLog?». Debe responder con la lista (usa `list_applications`).

## Paso 4 — Pregúntale como a un compañero

Funcionan mejor las preguntas de investigación que las búsquedas literales:

- «¿Qué está fallando en producción en las últimas 6 horas?»
- «El pedido 8891 no se facturó. Busca su traza y dime dónde se rompió.»
- «¿Hay errores nuevos hoy que no aparecieran ayer?»
- «Acabo de desplegar. ¿Ha aparecido algún error nuevo en los últimos 15 minutos?»
- «Coge el error más frecuente de facturación, mira su stack y el contexto, y propón un arreglo.»

> [!TIP]
> ¿Aún no hay logs interesantes? Un admin puede generar unos de prueba en **Espacio → Lab** (**Error agrupado** y **Traza distribuida**) y pedirle luego al asistente que los analice.

Para que lo use solo al depurar, añade al `CLAUDE.md` (o equivalente) de tu proyecto:

```markdown
## Logs de producción
Este proyecto envía sus logs a MCLog (servidor MCP `mclog`). Al investigar un fallo,
empieza por `get_error_groups`, usa `get_trace` si cruza servicios y `get_log_context`
para ver qué pasó justo antes. La aplicación se llama `<nombre>`.
```

## Sin MCP: el brief para IA

Si tu asistente no admite MCP, o prefieres pasarle un caso concreto:

- **Copiar para IA** en el detalle de un log, en **Errores** (botón ✦) o en una **Traza**.
- **Reportes → Brief para agentes IA** para un rango completo.

Los dos enmascaran correos, IPs, tokens y contraseñas antes de copiar.

## Si algo falla

| Síntoma | Solución |
|---|---|
| El cliente dice `401` | Clave mal copiada, revocada o caducada. Comprueba que la cabecera sea `Authorization: Bearer mclog_…` |
| El cliente dice `403` | La clave no tiene el permiso **Consultar logs y errores** |
| `404` en `/mcp` | El servidor MCP está desactivado (`MCP_ENABLED=0`) o la URL no apunta a la API |
| `405 Method not allowed` | Tu cliente intenta abrir un stream con `GET`; el endpoint es sin estado y solo admite `POST`. Usa el transporte HTTP del cliente |
| El asistente no ve una aplicación | La clave está acotada a otras aplicaciones |
| No encuentra logs que sí existen | Pídele que amplíe la ventana de tiempo: muchas herramientas miran las últimas 24 h por defecto |

Referencia completa de herramientas y buenas prácticas en [AI_INTEGRATION.md](../AI_INTEGRATION.md).
