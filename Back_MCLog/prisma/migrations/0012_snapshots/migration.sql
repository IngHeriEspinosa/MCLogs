-- Snapshots: copias congeladas de una vista de logs, compartibles con un
-- enlace. Tabla nueva; no toca datos existentes.

-- CreateEnum
CREATE TYPE "SnapshotVisibility" AS ENUM ('workspace', 'public');

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "visibility" "SnapshotVisibility" NOT NULL DEFAULT 'workspace',
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "logs" JSONB NOT NULL,
    "totalMatched" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_token_key" ON "Snapshot"("token");

-- CreateIndex
CREATE INDEX "Snapshot_workspaceId_createdAt_idx" ON "Snapshot"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Snapshot_expiresAt_idx" ON "Snapshot"("expiresAt");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
