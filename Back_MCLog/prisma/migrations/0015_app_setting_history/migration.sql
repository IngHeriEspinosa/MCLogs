-- Historial de la configuracion de la plataforma: quien cambio que, cuando y
-- de que valor a cual. Tabla nueva; no toca datos existentes.

-- CreateTable
CREATE TABLE "AppSettingChange" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "fromValue" JSONB NOT NULL,
    "toValue" JSONB NOT NULL,
    "reset" BOOLEAN NOT NULL DEFAULT false,
    "changedById" INTEGER,
    "changedByEmail" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSettingChange_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AppSettingChange" ADD CONSTRAINT "AppSettingChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
