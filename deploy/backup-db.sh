#!/bin/sh
# Backup cifrado opcional: BACKUP_PASSPHRASE=<secreto> ./deploy/backup-db.sh
set -eu
umask 077

APP_DIR=${APP_DIR:-/opt/fabsoft}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/fabsoft}
RETENTION_DAYS=${RETENTION_DAYS:-30}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BACKUP_DIR/fabsoft-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$FILE" -out "$FILE.enc" \
    -pass env:BACKUP_PASSPHRASE
  rm -f "$FILE"
  FILE="$FILE.enc"
fi

find "$BACKUP_DIR" -type f \( -name 'fabsoft-*.dump' -o -name 'fabsoft-*.dump.enc' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "$FILE"
