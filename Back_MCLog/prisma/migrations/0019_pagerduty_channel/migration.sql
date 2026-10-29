-- Canal de alertas PagerDuty (Events API v2). Solo anade un valor al enum:
-- no toca canales ni datos existentes.

-- AlterEnum
ALTER TYPE "AlertChannelType" ADD VALUE 'pagerduty';
