-- Espacios de trabajo: logs, API keys y alertas pasan a pertenecer a un
-- espacio, y solo sus miembros los ven.
--
-- Todo lo que ya existia va al espacio 1 ("Principal"). Los admins quedan como
-- dueños y el resto de cuentas como miembros, que es lo que ya podian hacer:
-- nadie gana acceso con la migracion, y quien no deba estar se quita despues.

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workspace_deletedAt_idx" ON "Workspace"("deletedAt");

INSERT INTO "Workspace" ("id", "name") VALUES (1, 'Principal');
SELECT setval(pg_get_serial_sequence('"Workspace"', 'id'), 1, true);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);

CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role")
SELECT 1, "id", CASE WHEN "role" = 'admin' THEN 'owner'::"WorkspaceRole" ELSE 'member'::"WorkspaceRole" END
FROM "User";

-- Cuentas: las existentes ya estan activas; solo las invitadas a partir de
-- ahora nacen pendientes.
ALTER TABLE "User" ADD COLUMN "activatedAt" TIMESTAMP(3);
UPDATE "User" SET "activatedAt" = "createdAt";

-- Columnas workspaceId. Con un DEFAULT constante, PostgreSQL 11+ anade la
-- columna sin reescribir la tabla: es instantaneo aunque Log tenga millones de
-- filas. El DEFAULT se retira despues para que ninguna escritura olvide el espacio.
ALTER TABLE "Log" ADD COLUMN "workspaceId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Log" ALTER COLUMN "workspaceId" DROP DEFAULT;

ALTER TABLE "ApiKey" ADD COLUMN "workspaceId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ApiKey" ALTER COLUMN "workspaceId" DROP DEFAULT;

ALTER TABLE "AlertChannel" ADD COLUMN "workspaceId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AlertChannel" ALTER COLUMN "workspaceId" DROP DEFAULT;

ALTER TABLE "AlertRule" ADD COLUMN "workspaceId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AlertRule" ALTER COLUMN "workspaceId" DROP DEFAULT;

ALTER TABLE "Log" ADD CONSTRAINT "Log_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlertChannel" ADD CONSTRAINT "AlertChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");
CREATE INDEX "AlertChannel_workspaceId_idx" ON "AlertChannel"("workspaceId");
CREATE INDEX "AlertRule_workspaceId_idx" ON "AlertRule"("workspaceId");

-- Indices de Log: todos empiezan por workspaceId, porque toda consulta va
-- acotada a un espacio. Los de una sola columna y los compuestos sin espacio ya
-- no los usa ninguna consulta y solo encarecian la ingesta. Se conserva el de
-- timestamp, que es el que usa la retencion.
--
-- Crear estos indices bloquea las escrituras en Log mientras se construyen
-- (unos segundos con un par de millones de filas).
DROP INDEX IF EXISTS "Log_application_idx";
DROP INDEX IF EXISTS "Log_level_idx";
DROP INDEX IF EXISTS "Log_environment_idx";
DROP INDEX IF EXISTS "Log_traceId_idx";
DROP INDEX IF EXISTS "Log_application_timestamp_idx";
DROP INDEX IF EXISTS "Log_level_timestamp_idx";
DROP INDEX IF EXISTS "Log_fingerprint_timestamp_idx";
DROP INDEX IF EXISTS "Log_environment_level_timestamp_idx";

CREATE INDEX "Log_workspaceId_timestamp_idx" ON "Log"("workspaceId", "timestamp");
CREATE INDEX "Log_workspaceId_application_timestamp_idx" ON "Log"("workspaceId", "application", "timestamp");
CREATE INDEX "Log_workspaceId_level_timestamp_idx" ON "Log"("workspaceId", "level", "timestamp");
CREATE INDEX "Log_workspaceId_fingerprint_timestamp_idx" ON "Log"("workspaceId", "fingerprint", "timestamp");
CREATE INDEX "Log_workspaceId_traceId_idx" ON "Log"("workspaceId", "traceId");
CREATE INDEX "Log_workspaceId_environment_level_timestamp_idx" ON "Log"("workspaceId", "environment", "level", "timestamp");
