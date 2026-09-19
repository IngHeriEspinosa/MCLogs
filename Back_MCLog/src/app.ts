import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import client from "prom-client";
import { config } from "./config/env";
import logger from "./config/logger";
import { prisma } from "./config/prisma";
import { swaggerSpec } from "./config/swagger";
import logRoutes from "./routes/logRoutes";
import apiKeyRoutes from "./routes/apiKeyRoutes";
import { requestLogger } from "./middlewares/requestLogger";
import { requireApiKey } from "./middlewares/authApiKey";
import { errorHandler } from "./middlewares/errorHandler";
import { requestContext } from "./middlewares/requestContext";
import authRoutes from "./routes/authRoutes";
import { enforceHttps } from "./middlewares/enforceHttps";
import { queryLimiter } from "./middlewares/rateLimiters";

export const createApp = () => {
  const app = express();

  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

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
  app.use(requestContext);
  app.use(requestLogger);
  app.use(enforceHttps);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use("/auth", queryLimiter, authRoutes);

  app.get("/", (_req: Request, res: Response) => {
    res.send("Log Service is running!");
  });

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error("Health check failed", { error });
      res.status(503).json({ status: "degraded" });
    }
  });

  app.get("/metrics", requireApiKey("metrics"), async (_req: Request, res: Response) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  // Administración de API keys: solo admin (el propio router aplica auth y rol)
  app.use("/api/keys", apiKeyRoutes);

  // Auth y rate limiting se aplican por ruta dentro de logRoutes
  // (la ingesta usa API key + límite alto; las consultas usan JWT + límite estándar)
  app.use("/api", logRoutes);
  app.use(errorHandler);

  return app;
};

const app = createApp();
export default app;
