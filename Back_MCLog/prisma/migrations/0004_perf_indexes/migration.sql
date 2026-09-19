-- Índices compuestos para las consultas más comunes del dashboard:
-- filtrar por aplicación o nivel ordenando por fecha.
CREATE INDEX IF NOT EXISTS "Log_application_timestamp_idx" ON "Log"("application", "timestamp");
CREATE INDEX IF NOT EXISTS "Log_level_timestamp_idx" ON "Log"("level", "timestamp");
