#!/bin/sh
# PROCURE360 · PostgreSQL backup sidecar.
# Dumps the database in compressed custom format, checks the archive, and
# prunes dumps older than BACKUP_RETENTION_DAYS.
set -u

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
DEST="/backups"

mkdir -p "$DEST"

echo "Backup worker started · every ${INTERVAL}s · retention ${RETENTION}d"
while true; do
  STAMP="$(date +%Y%m%d-%H%M%S)"
  FILE="$DEST/procure360-${STAMP}.dump"
  echo "[$(date -Iseconds)] dumping to $FILE"
  if pg_dump --format=custom --no-owner --no-acl --file="$FILE"; then
    if pg_restore --list "$FILE" >/dev/null 2>&1; then
      echo "[$(date -Iseconds)] backup verified ($(du -h "$FILE" | cut -f1))"
    else
      echo "[$(date -Iseconds)] WARNING: backup archive failed verification" >&2
      mv "$FILE" "$FILE.invalid"
    fi
  else
    echo "[$(date -Iseconds)] ERROR: pg_dump failed" >&2
    rm -f "$FILE"
  fi
  find "$DEST" -name 'procure360-*.dump' -type f -mtime +"$RETENTION" -print -delete
  sleep "$INTERVAL"
done
