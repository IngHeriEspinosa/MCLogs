#!/bin/sh
# Copia de seguridad de la base de datos de MCLog.
# Se ejecuta dentro del servicio "backup", que la lanza una vez al dia.
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DESTINO="/backups"
FICHERO="${DESTINO}/mclog_$(date +%Y-%m-%d_%H%M%S).dump"

mkdir -p "$DESTINO"

# Formato custom (-Fc): comprimido y restaurable con pg_restore de forma
# selectiva, tabla a tabla si hiciera falta.
echo "[backup] volcando ${PGDATABASE} a ${FICHERO}"
pg_dump -Fc -f "$FICHERO"

# Solo se borran copias antiguas si la nueva existe y no esta vacia: un fallo
# del volcado no debe llevarse por delante el historico.
if [ -s "$FICHERO" ]; then
	echo "[backup] correcto ($(du -h "$FICHERO" | cut -f1)); limpiando copias de mas de ${RETENTION_DAYS} dias"
	find "$DESTINO" -name 'mclog_*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete
else
	echo "[backup] ERROR: el volcado esta vacio, se conservan las copias anteriores" >&2
	rm -f "$FICHERO"
	exit 1
fi
