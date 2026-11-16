#!/usr/bin/env bash
# Nightly MySQL backup with 14-day retention.
# Add to cron: 30 3 * * * /opt/campus/deploy/scripts/backup-mysql.sh
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/campus}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_NAME="${MYSQL_DATABASE:-campus}"
DB_USER="${MYSQL_USER:-campus}"
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"

MYSQL_PWD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}" \
  mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers --set-gtid-purged=OFF \
  "$DB_NAME" | gzip -9 > "$target"

gzip -t "$target"
sha256sum "$target" > "$target.sha256"
find "$BACKUP_DIR" -type f -name '*.sql.gz*' -mtime +"$RETENTION_DAYS" -delete
echo "backup ok: $target"
