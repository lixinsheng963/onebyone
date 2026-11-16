#!/usr/bin/env bash
# Liveness/readiness probe used by cron/monitoring.
set -euo pipefail
BASE_URL="${PUBLIC_BASE_URL:-https://campus.example.com}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/healthz}"
curl -fsS --max-time 5 "$HEALTH_URL" | grep -q '"status":"ok"'
if command -v mysqladmin >/dev/null 2>&1; then
  MYSQL_PWD="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}" \
    mysqladmin --host="${MYSQL_HOST:-127.0.0.1}" --port="${MYSQL_PORT:-3306}" \
    --user="${MYSQL_USER:-campus}" ping --silent
fi
echo "health ok: $HEALTH_URL"
