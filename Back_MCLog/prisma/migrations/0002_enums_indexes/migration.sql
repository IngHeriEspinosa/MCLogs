-- Reset existing objects (dev only)
DROP TABLE IF EXISTS "Log" CASCADE;
DROP TYPE IF EXISTS "LogLevel";
DROP TYPE IF EXISTS "Environment";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('development', 'staging', 'production');

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "application" TEXT NOT NULL,
    "service" TEXT,
    "host" TEXT,
    "level" "LogLevel" NOT NULL,
    "environment" "Environment" NOT NULL,
    "message" TEXT NOT NULL,
    "traceId" VARCHAR(128),
    "spanId" VARCHAR(128),
    "metadata" JSONB,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Log_timestamp_idx" ON "Log"("timestamp");

-- CreateIndex
CREATE INDEX "Log_application_idx" ON "Log"("application");

-- CreateIndex
CREATE INDEX "Log_level_idx" ON "Log"("level");

-- CreateIndex
CREATE INDEX "Log_environment_idx" ON "Log"("environment");

-- CreateIndex
CREATE INDEX "Log_traceId_idx" ON "Log"("traceId");
