#!/bin/sh
# Restaura una copia de seguridad de MCLog.
#
#   docker compose -f docker-compose.prod.yml stop api
#   docker compose -f docker-compose.prod.yml run --rm backup /scripts/restore.sh /backups/mclog_2026-09-19_030000.dump
#   docker compose -f docker-compose.prod.yml start api
#
# SOBRESCRIBE los datos actuales: pide confirmacion salvo que se pase --force.
set -eu

FICHERO="${1:-}"
if [ -z "$FICHERO" ] || [ ! -f "$FICHERO" ]; then
	echo "Uso: restore.sh <fichero.dump> [--force]" >&2
	echo "Copias disponibles:" >&2
	ls -1 /backups/mclog_*.dump 2>/dev/null >&2 || echo "  (ninguna)" >&2
	exit 1
fi

if [ "${2:-}" != "--force" ]; then
	printf 'Esto reemplaza el contenido de %s con %s. Escribe "si" para continuar: ' "$PGDATABASE" "$FICHERO"
	read -r respuesta
	[ "$respuesta" = "si" ] || { echo "Cancelado."; exit 1; }
fi

echo "[restore] restaurando ${FICHERO} en ${PGDATABASE}"
# --clean --if-exists deja la base en el estado exacto del volcado.
pg_restore --clean --if-exists --no-owner --dbname "$PGDATABASE" "$FICHERO"
echo "[restore] terminado. Arranca la api de nuevo."
