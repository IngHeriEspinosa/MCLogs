import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/env";
import { registry } from "./config/metrics";
import { APP_VERSION } from "./config/version";
import logger from "./config/logger";
import { prisma } from "./config/prisma";
import { swaggerSpec } from "./config/swagger";
import logRoutes from "./routes/logRoutes";
import apiKeyRoutes from "./routes/apiKeyRoutes";
import alertRoutes from "./routes/alertRoutes";
import workspaceRoutes from "./routes/workspaceRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import { snapshotRouter, snapshotViewRouter } from "./routes/snapshotRoutes";
import mcpRouter from "./mcp/router";
import { requestLogger } from "./middlewares/requestLogger";
import { requireApiKey } from "./middlewares/authApiKey";
import { errorHandler } from "./middlewares/errorHandler";
import { requestContext } from "./middlewares/requestContext";
import authRoutes from "./routes/authRoutes";
import { enforceHttps } from "./middlewares/enforceHttps";
import { queryLimiter } from "./middlewares/rateLimiters";
import { compressJson } from "./middlewares/compressJson";

export const createApp = () => {
  const app = express();

  app.set("trust proxy", config.trustProxy);
  app.use(helmet());

  const allowedOrigins = config.corsOrigins?.length ? config.corsOrigins : undefined;
  const corsMiddleware = cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser tools/health checks
      if (!allowedOrigins) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      const err = new Error("CORS origin not allowed");
      (err as any).status = 403;
      return callback(err, false);
    },
    credentials: true,
  });
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(compressJson);
  app.use(requestContext);
  app.use(requestLogger);
  app.use(enforceHttps);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use("/auth", queryLimiter, authRoutes);

  app.get("/", (_req: Request, res: Response) => {
    res.send("Log Service is running!");
  });

  app.get("/health", async (_req: Request, res: Response) => {
    const base = {
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    try {
      // El health check consulta la base de datos: un proceso vivo que no
      // alcanza PostgreSQL no puede servir de nada y debe salir del balanceador.
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "up", ...base });
    } catch (error) {
      logger.error("Health check failed", { error });
      res.status(503).json({ status: "degraded", database: "down", ...base });
    }
  });

  // Especificacion OpenAPI en crudo, para generar clientes y tipos.
  app.get("/openapi.json", (_req: Request, res: Response) => {
    res.json(swaggerSpec);
  });

  app.get("/metrics", requireApiKey("metrics"), async (_req: Request, res: Response) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  // Servidor MCP: permite que un asistente de IA consulte los logs con
  // herramientas en lugar de construir URLs. Autenticado como cualquier lectura.
  // Se monta siempre: si esta apagado (configuracion `mcpEnabled`) el propio
  // router responde 404, y se puede encender sin reiniciar.
  app.use("/mcp", mcpRouter);

  // Configuracion de la aplicacion: la edita solo la cuenta root.
  app.use("/api/settings", settingsRoutes);

  // Espacios de trabajo y sus miembros (el propio router aplica auth y rol).
  app.use("/api/workspaces", workspaceRoutes);

  // API keys del espacio activo: solo su dueño.
  app.use("/api/keys", apiKeyRoutes);

  // Alertas del espacio activo (canales, reglas e historial): solo su dueño.
  app.use("/api/alerts", alertRoutes);

  // Snapshots: se gestionan en el espacio activo y se leen por su enlace. La
  // lectura va en /api/share, sin espacio activo (el enlace ya dice cual es) y
  // bajo /api para que el proxy la mande a la API en cualquier topologia.
  app.use("/api/snapshots", snapshotRouter);
  app.use("/api/share", snapshotViewRouter);

  // Auth y rate limiting se aplican por ruta dentro de logRoutes
  // (la ingesta usa API key + límite alto; las consultas usan JWT + límite estándar)
  app.use("/api", logRoutes);
  app.use(errorHandler);

  return app;
};

const app = createApp();
export default app;
