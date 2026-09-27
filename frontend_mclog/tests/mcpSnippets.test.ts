import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MCP_CLIENTS, buildMcpSnippet, mcpUrl, snippetLanguage } from "@/common/mcp/snippets";

const URL = "https://mclog.example.com/mcp";
const KEY = "mclog_xxxxxxxx_tu-clave";

describe("URL del endpoint MCP", () => {
  it("añade /mcp al origen de la API sin duplicar barras", () => {
    assert.equal(mcpUrl("https://mclog.example.com"), URL);
    assert.equal(mcpUrl("https://mclog.example.com/"), URL);
    assert.equal(mcpUrl("https://api.example.com//"), "https://api.example.com/mcp");
  });
});

describe("Configuracion de cada asistente", () => {
  it("Claude Code: comando con transporte HTTP y cabecera Bearer", () => {
    const snippet = buildMcpSnippet("claude-code", URL, KEY);
    assert.equal(snippet, `claude mcp add --transport http mclog ${URL} \\\n  --header "Authorization: Bearer ${KEY}"`);
    assert.equal(snippetLanguage("claude-code"), "text");
  });

  it("Cursor: mcpServers con url y cabeceras", () => {
    assert.deepEqual(JSON.parse(buildMcpSnippet("cursor", URL, KEY)), {
      mcpServers: { mclog: { url: URL, headers: { Authorization: `Bearer ${KEY}` } } },
    });
  });

  it("VS Code: servers con type http", () => {
    assert.deepEqual(JSON.parse(buildMcpSnippet("vscode", URL, KEY)), {
      servers: { mclog: { type: "http", url: URL, headers: { Authorization: `Bearer ${KEY}` } } },
    });
  });

  it("Claude Desktop: puente mcp-remote por stdio", () => {
    assert.deepEqual(JSON.parse(buildMcpSnippet("claude-desktop", URL, KEY)), {
      mcpServers: {
        mclog: { command: "npx", args: ["-y", "mcp-remote", URL, "--header", `Authorization: Bearer ${KEY}`] },
      },
    });
  });

  it("todos los clientes generan un ejemplo con la URL y el marcador de la clave", () => {
    for (const client of MCP_CLIENTS) {
      const snippet = buildMcpSnippet(client, URL, KEY);
      assert.ok(snippet.includes(URL), client);
      assert.ok(snippet.includes(KEY), client);
    }
  });
});
