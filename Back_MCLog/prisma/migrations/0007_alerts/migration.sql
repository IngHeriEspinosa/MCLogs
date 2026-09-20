-- CreateEnum
CREATE TYPE "AlertChannelType" AS ENUM ('webhook', 'email', 'telegram');

-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('threshold', 'new_error_group');

-- CreateTable
CREATE TABLE "AlertChannel" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AlertChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AlertRuleType" NOT NULL DEFAULT 'threshold',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "application" VARCHAR(120),
    "service" VARCHAR(120),
    "environment" "Environment",
    "level" "LogLevel" NOT NULL DEFAULT 'error',
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "windowMinutes" INTEGER NOT NULL DEFAULT 10,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL,
    "sampleLogIds" INTEGER[],
    "deliveries" JSONB NOT NULL,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AlertChannelToAlertRule" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_AlertChannelToAlertRule_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertEvent_ruleId_triggeredAt_idx" ON "AlertEvent"("ruleId", "triggeredAt");

-- CreateIndex
CREATE INDEX "_AlertChannelToAlertRule_B_index" ON "_AlertChannelToAlertRule"("B");

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlertChannelToAlertRule" ADD CONSTRAINT "_AlertChannelToAlertRule_A_fkey" FOREIGN KEY ("A") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlertChannelToAlertRule" ADD CONSTRAINT "_AlertChannelToAlertRule_B_fkey" FOREIGN KEY ("B") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

