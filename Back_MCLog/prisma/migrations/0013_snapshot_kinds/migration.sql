-- Snapshots de otras pantallas (errores agrupados y trazas), no solo de Logs.
-- Los existentes son todos de Logs: el valor por defecto los cubre.

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('logs', 'errors', 'trace');

-- AlterTable
ALTER TABLE "Snapshot" ADD COLUMN "kind" "SnapshotKind" NOT NULL DEFAULT 'logs';
