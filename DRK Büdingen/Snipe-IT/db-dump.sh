#!/usr/bin/env bash
#
# Erstellt einen konsistenten Datenbank-Dump von Snipe-IT als Datei in
# ./dumps/. Die eigentliche Datensicherung (Aufbewahrung, Offsite-Kopie)
# übernimmt TerraCloud Backup - das Skript liefert dafür lediglich eine
# konsistente Dump-Datei, da ein reines Datei-Backup der laufenden
# MariaDB-Datendateien (./data/db) inkonsistent werden kann.
#
# TerraCloud so konfigurieren, dass diese zwei Host-Ordner gesichert werden:
#   - ./dumps        (von diesem Skript erzeugte SQL-Dumps)
#   - ./data/uploads  (hochgeladene Dateien: Fotos, Lizenzdateien, Anhänge)
# ./data/db NICHT direkt sichern (laufende Datenbankdateien) - dafür dient
# der Dump.
#
# Verwendung:
#   ./db-dump.sh
#
# Empfohlen: als tägliche Cron-Aufgabe einrichten, z. B.
#   crontab -e
#   0 2 * * * cd /pfad/zu/"DRK Büdingen/Snipe-IT" && ./db-dump.sh >> dumps/db-dump.log 2>&1
#
# (Zeitlich vor dem TerraCloud-Lauf einplanen, damit ein frischer Dump
# vorliegt, wenn TerraCloud den Ordner ./dumps sichert.)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

DUMP_DIR="${SCRIPT_DIR}/dumps"
RETENTION_DAYS=7   # nur lokale Aufräumung, damit die Platte nicht vollläuft -
                    # die eigentliche Langzeit-Aufbewahrung macht TerraCloud.
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"

if [[ ! -f .env ]]; then
    echo "Fehler: .env nicht gefunden - bitte im Snipe-IT-Verzeichnis ausführen." >&2
    exit 1
fi

# shellcheck disable=SC1091
source .env

mkdir -p "$DUMP_DIR"

DUMP_FILE="${DUMP_DIR}/snipeit-db_${TIMESTAMP}.sql.gz"
echo "=== Snipe-IT DB-Dump ${TIMESTAMP} ==="
echo "Erzeuge ${DUMP_FILE} ..."
docker compose exec -T snipeit-db \
    mariadb-dump --single-transaction -u root -p"${DB_ROOT_PASSWORD}" "${DB_DATABASE}" \
    | gzip > "$DUMP_FILE"

echo "Dump abgeschlossen: ${DUMP_FILE}"

echo "Lösche lokale Dumps älter als ${RETENTION_DAYS} Tage ..."
find "$DUMP_DIR" -type f -name 'snipeit-db_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

echo "=== Fertig ==="
