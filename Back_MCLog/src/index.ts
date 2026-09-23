import app from "./app";
import { config, assertProductionConfig } from "./config/env";
import { prisma } from "./config/prisma";
import logger from "./config/logger";
import { ensureAdminUser } from "./services/authService";
import { startScheduler, stopScheduler } from "./jobs/scheduler";
import { startSettingsSync, stopSettingsSync } from "./services/settingsService";

const connectWithRetry = async (retries = 10, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      logger.warn(`Base de datos no disponible (intento ${attempt}/${retries})`, { error: String(error) });
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

(async () => {
  try {
    assertProductionConfig();
    await connectWithRetry();
    await ensureAdminUser();
    // Antes de escuchar: la primera peticion ya debe ver la configuracion guardada.
    await startSettingsSync();
    startScheduler();

    const server = app.listen(config.port, () => {
      logger.info(`Server is running on http://localhost:${config.port}`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} recibido, cerrando servidor...`);
      stopScheduler();
      stopSettingsSync();
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      // Forzar salida si algo queda colgado
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("No se pudo iniciar el servidor", { error: String(error) });
    process.exit(1);
  }
})();
