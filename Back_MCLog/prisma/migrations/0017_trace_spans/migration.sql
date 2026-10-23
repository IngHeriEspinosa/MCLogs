-- Tramos de una traza: el tramo padre y la duracion, para anidar los pasos de
-- una operacion y pintar su duracion real. Columnas nuevas y opcionales: no
-- tocan datos existentes.

-- AlterTable
ALTER TABLE "Log" ADD COLUMN "parentSpanId" VARCHAR(128),
ADD COLUMN "durationMs" INTEGER;
