-- Monitoreo: ciclo de vida de los fallos (ErrorGroup), alertas con estado,
-- silencio y recuperacion, release de cada log, vistas guardadas y resumenes
-- programados. Todo son tablas y columnas nuevas; al final se rellena
-- ErrorGroup con lo que ya hay en Log.
-- CreateEnum
CREATE TYPE "ErrorGroupStatus" AS ENUM ('active', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('daily', 'weekly');

-- CreateEnum
CREATE TYPE "AlertRuleState" AS ENUM ('ok', 'firing');

-- CreateEnum
CREATE TYPE "AlertEventKind" AS ENUM ('trigger', 'resolve');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertRuleType" ADD VALUE 'regression';
ALTER TYPE "AlertRuleType" ADD VALUE 'error_rate';
ALTER TYPE "AlertRuleType" ADD VALUE 'silence';
ALTER TYPE "AlertRuleType" ADD VALUE 'spike';

-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "release" VARCHAR(120);

-- AlterTable
ALTER TABLE "AlertRule" ADD COLUMN     "minVolume" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "state" "AlertRuleState" NOT NULL DEFAULT 'ok';

-- AlterTable
ALTER TABLE "AlertEvent" ADD COLUMN     "kind" "AlertEventKind" NOT NULL DEFAULT 'trigger';

-- CreateTable
CREATE TABLE "ErrorGroup" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "application" TEXT NOT NULL,
    "service" TEXT,
    "errorName" VARCHAR(200),
    "errorCode" VARCHAR(100),
    "level" "LogLevel" NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ErrorGroupStatus" NOT NULL DEFAULT 'active',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "ignoredUntil" TIMESTAMP(3),
    "regressionCount" INTEGER NOT NULL DEFAULT 0,
    "lastRegressedAt" TIMESTAMP(3),
    "firstRelease" VARCHAR(120),
    "lastRelease" VARCHAR(120),
    "note" VARCHAR(2000),

    CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "path" VARCHAR(64) NOT NULL,
    "query" VARCHAR(2000) NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestSchedule" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'daily',
    "hourUtc" INTEGER NOT NULL DEFAULT 8,
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "environment" "Environment",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AlertChannelToDigestSchedule" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_AlertChannelToDigestSchedule_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ErrorGroup_workspaceId_status_lastSeen_idx" ON "ErrorGroup"("workspaceId", "status", "lastSeen");

-- CreateIndex
CREATE INDEX "ErrorGroup_workspaceId_firstSeen_idx" ON "ErrorGroup"("workspaceId", "firstSeen");

-- CreateIndex
CREATE INDEX "ErrorGroup_workspaceId_lastRegressedAt_idx" ON "ErrorGroup"("workspaceId", "lastRegressedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorGroup_workspaceId_fingerprint_key" ON "ErrorGroup"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "SavedView_workspaceId_idx" ON "SavedView"("workspaceId");

-- CreateIndex
CREATE INDEX "DigestSchedule_enabled_idx" ON "DigestSchedule"("enabled");

-- CreateIndex
CREATE INDEX "DigestSchedule_workspaceId_idx" ON "DigestSchedule"("workspaceId");

-- CreateIndex
CREATE INDEX "_AlertChannelToDigestSchedule_B_index" ON "_AlertChannelToDigestSchedule"("B");

-- AddForeignKey
ALTER TABLE "ErrorGroup" ADD CONSTRAINT "ErrorGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorGroup" ADD CONSTRAINT "ErrorGroup_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestSchedule" ADD CONSTRAINT "DigestSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlertChannelToDigestSchedule" ADD CONSTRAINT "_AlertChannelToDigestSchedule_A_fkey" FOREIGN KEY ("A") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlertChannelToDigestSchedule" ADD CONSTRAINT "_AlertChannelToDigestSchedule_B_fkey" FOREIGN KEY ("B") REFERENCES "DigestSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: un grupo por huella con lo que conserva Log. Los datos que nombran
-- el fallo salen de su ocurrencia mas reciente; firstSeen y totalCount, de
-- todo lo retenido. Las releases quedan vacias: Log no las tenia.
INSERT INTO "ErrorGroup" ("workspaceId", "fingerprint", "application", "service", "errorName", "errorCode", "level", "firstSeen", "lastSeen", "totalCount")
SELECT a."workspaceId", a."fingerprint", s."application", s."service", s."errorName", s."errorCode", a."level", a."firstSeen", a."lastSeen", a."total"
FROM (
    SELECT "workspaceId", "fingerprint", MAX("level") AS "level", MIN("timestamp") AS "firstSeen", MAX("timestamp") AS "lastSeen", COUNT(*)::int AS "total"
    FROM "Log"
    WHERE "fingerprint" IS NOT NULL
    GROUP BY "workspaceId", "fingerprint"
) a
JOIN (
    SELECT DISTINCT ON ("workspaceId", "fingerprint") "workspaceId", "fingerprint", "application", "service", "errorName", "errorCode"
    FROM "Log"
    WHERE "fingerprint" IS NOT NULL
    ORDER BY "workspaceId", "fingerprint", "timestamp" DESC, "id" DESC
) s USING ("workspaceId", "fingerprint");
