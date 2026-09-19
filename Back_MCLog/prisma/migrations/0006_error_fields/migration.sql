-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "errorCode" VARCHAR(100),
ADD COLUMN     "errorName" VARCHAR(200),
ADD COLUMN     "errorStack" TEXT,
ADD COLUMN     "fingerprint" VARCHAR(64);

-- CreateIndex
CREATE INDEX "Log_fingerprint_timestamp_idx" ON "Log"("fingerprint", "timestamp");

-- CreateIndex
CREATE INDEX "Log_environment_level_timestamp_idx" ON "Log"("environment", "level", "timestamp");

