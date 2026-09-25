-- La retencion pasa de dias (0 = nunca borrar) a meses, entre 3 y 60. Un valor
-- guardado en dias se convierte y se acota; el 0 ("nunca") desaparece y pasa
-- a regir el valor predeterminado (RETENTION_MONTHS o 3 meses).
INSERT INTO "AppSetting" ("key", "value", "updatedAt", "updatedById")
SELECT
    'retentionMonths',
    to_jsonb(LEAST(60, GREATEST(3, ROUND(("value"::text)::numeric / 30.44))))::jsonb,
    "updatedAt",
    "updatedById"
FROM "AppSetting"
WHERE "key" = 'retentionDays'
  AND jsonb_typeof("value") = 'number'
  AND ("value"::text)::numeric > 0
ON CONFLICT ("key") DO NOTHING;

DELETE FROM "AppSetting" WHERE "key" = 'retentionDays';
