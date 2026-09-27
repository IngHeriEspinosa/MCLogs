/**
 * Configuracion lista para copiar con la que cada asistente se conecta al
 * servidor MCP de MCLog.
 *
 * La clave nunca es real: el panel no vuelve a tener el secreto despues de
 * crearlo (solo queda su hash), asi que todos los ejemplos llevan un marcador
 * que el usuario sustituye por su clave `read`.
 */

export type McpClient = "claude-code" | "cursor" | "vscode" | "claude-desktop";

export const MCP_CLIENTS: McpClient[] = ["claude-code", "cursor", "vscode", "claude-desktop"];

/** Comando con el que Claude Code instala el skill desde el servidor MCP. */
export const INSTALL_SKILL_COMMAND = "/mcp__mclog__install_skill";

/** URL del endpoint MCP a partir del origen de la API, sin barras duplicadas. */
export const mcpUrl = (apiOrigin: string) => `${apiOrigin.replace(/\/+$/, "")}/mcp`;

const json = (value: unknown) => JSON.stringify(value, null, 2);

export const buildMcpSnippet = (client: McpClient, url: string, key: string): string => {
  const authorization = `Bearer ${key}`;
  switch (client) {
    case "claude-code":
      return `claude mcp add --transport http mclog ${url} \\\n  --header "Authorization: ${authorization}"`;
    case "cursor":
      return json({ mcpServers: { mclog: { url, headers: { Authorization: authorization } } } });
    case "vscode":
      return json({ servers: { mclog: { type: "http", url, headers: { Authorization: authorization } } } });
    case "claude-desktop":
      // Claude Desktop solo habla por stdio: mcp-remote hace de puente con HTTP.
      return json({
        mcpServers: {
          mclog: { command: "npx", args: ["-y", "mcp-remote", url, "--header", `Authorization: ${authorization}`] },
        },
      });
  }
};

/** Lenguaje del bloque de codigo, para resaltarlo. */
export const snippetLanguage = (client: McpClient): "json" | "text" => (client === "claude-code" ? "text" : "json");
