#!/usr/bin/env bash
#
# Sichert die Snipe-IT-Datenbank sowie die hochgeladenen Dateien
# (Fotos, Lizenzdateien, Anhänge) aus den Docker-Volumes.
#
# Verwendung:
#   ./backup.sh                  Sicherung erstellen, alte Sicherungen nach
#                                 Aufbewahrungsfrist löschen
#
# Empfohlen: als tägliche Cron-Aufgabe einrichten, z. B.
#   crontab -e
#   0 3 * * * cd /pfad/zu/Snipe-IT && ./backup.sh >> backups/backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

BACKUP_DIR="${SCRIPT_DIR}/backups"
RETENTION_DAYS=30
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"

if [[ ! -f .env ]]; then
    echo "Fehler: .env nicht gefunden - bitte im Snipe-IT-Verzeichnis ausführen." >&2
    exit 1
fi

# shellcheck disable=SC1091
source .env

mkdir -p "$BACKUP_DIR"

echo "=== Snipe-IT Backup ${TIMESTAMP} ==="

# 1. Datenbank sichern
DB_DUMP_FILE="${BACKUP_DIR}/snipeit-db_${TIMESTAMP}.sql.gz"
echo "Sichere Datenbank nach ${DB_DUMP_FILE} ..."
docker compose exec -T snipeit-db \
    mariadb-dump --single-transaction -u root -p"${DB_ROOT_PASSWORD}" "${DB_DATABASE}" \
    | gzip > "$DB_DUMP_FILE"

# 2. Hochgeladene Dateien (Volume snipeit-app-data) sichern
APP_DATA_FILE="${BACKUP_DIR}/snipeit-app-data_${TIMESTAMP}.tar.gz"
echo "Sichere Dateianhänge nach ${APP_DATA_FILE} ..."
docker run --rm \
    -v snipeit_snipeit-app-data:/data:ro \
    -v "${BACKUP_DIR}:/backup" \
    alpine \
    tar czf "/backup/$(basename "$APP_DATA_FILE")" -C /data .

echo "Backup abgeschlossen: ${DB_DUMP_FILE}, ${APP_DATA_FILE}"

# 3. Alte Backups gemäß Aufbewahrungsfrist löschen
echo "Lösche Backups älter als ${RETENTION_DAYS} Tage ..."
find "$BACKUP_DIR" -type f \( -name 'snipeit-db_*.sql.gz' -o -name 'snipeit-app-data_*.tar.gz' \) \
    -mtime "+${RETENTION_DAYS}" -print -delete

echo "=== Fertig ==="
