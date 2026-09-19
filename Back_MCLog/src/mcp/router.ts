import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import logger from "../config/logger";
import { requireAuthOrReadKey } from "../middlewares/authApiKey";
import { AuthenticatedRequest } from "../middlewares/requireAuth";
import { queryLimiter } from "../middlewares/rateLimiters";
import { buildMcpServer } from "./server";

/**
 * Endpoint MCP sobre HTTP (transporte Streamable HTTP).
 *
 * Es sin estado: cada peticion crea su propio servidor y transporte y los
 * destruye al terminar. Cuesta poco (no hay conexion que abrir) y a cambio el
 * backend sigue pudiendo escalar horizontalmente sin sesiones pegadas a una
 * instancia concreta.
 *
 * La autenticacion es la misma que la del resto de consultas: JWT de usuario o
 * API key con scope `read`, incluida su restriccion por aplicacion, que se
 * traslada al servidor MCP para que las herramientas no vean de mas.
 */
const router = express.Router();

/** Codigo JSON-RPC para peticiones mal formadas o no soportadas. */
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_INTERNAL_ERROR = -32603;

const jsonRpcError = (res: Response, status: number, code: number, message: string) => {
  if (res.headersSent) return;
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
};

router.post("/", queryLimiter, requireAuthOrReadKey, async (req: Request, res: Response) => {
  const applications = (req as AuthenticatedRequest).apiKey?.applications;
  const server = buildMcpServer({ applications });

  const transport = new StreamableHTTPServerTransport({
    // Sin generador de sesion: modo sin estado, una peticion y fuera.
    sessionIdGenerator: undefined,
    // Responde JSON plano en lugar de abrir un flujo SSE, que para peticiones
    // puntuales de herramientas es mas simple y atraviesa mejor los proxies.
    enableJsonResponse: true,
  });

  // Se cierran los dos al terminar la respuesta; si no, cada peticion dejaria
  // un servidor y un transporte vivos.
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("MCP request failed", { error: String(error) });
    jsonRpcError(res, 500, JSONRPC_INTERNAL_ERROR, "Internal server error");
  }
});

/**
 * El modo sin estado no admite el flujo SSE de servidor a cliente (GET) ni el
 * cierre de sesion (DELETE). Se responde con un error JSON-RPC explicito para
 * que el cliente lo entienda, en lugar del 404 de Express.
 */
const methodNotAllowed = (_req: Request, res: Response) =>
  jsonRpcError(res, 405, JSONRPC_INVALID_REQUEST, "Method not allowed: this MCP endpoint is stateless, use POST");

router.get("/", methodNotAllowed);
router.delete("/", methodNotAllowed);

export default router;
