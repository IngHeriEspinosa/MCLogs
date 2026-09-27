-- Ultimo uso de cada API key contra el servidor MCP, para el inventario de
-- claves de la plataforma. Columna nueva y opcional: no toca datos existentes.

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "lastMcpUsedAt" TIMESTAMP(3);
