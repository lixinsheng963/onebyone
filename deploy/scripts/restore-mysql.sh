#!/usr/bin/env bash
# Restore a backup produced by backup-mysql.sh.
# Usage: MYSQL_PASSWORD=... ./restore-mysql.sh /var/backups/campus/campus-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "usage: $0 <backup.sql.gz>" >&2
  exit 2
fi
backup="$1"
[ -f "$backup" ] || { echo "backup not found: $backup" >&2; exit 1; }
if [ -f "$backup.sha256" ]; then
  sha256sum -c "$backup.sha256"
fi
DB_NAME="${MYSQL_DATABASE:-campus}"
DB_USER="${MYSQL_USER:-campus}"
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
gzip -dc "$backup" | MYSQL_PWD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}" \
  mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --protocol=TCP "$DB_NAME"
echo "restore ok: $backup"
