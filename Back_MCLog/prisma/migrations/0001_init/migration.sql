-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable (versión inicial; 0002 la reemplaza con enums e índices)
CREATE TABLE IF NOT EXISTS "Log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "application" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);
