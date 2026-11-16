#!/usr/bin/env bash
# Liveness/readiness probe used by cron/monitoring.
# /readyz checks MySQL and Redis, so this script does not need database credentials.
set -euo pipefail
BASE_URL="${PUBLIC_BASE_URL:-https://campus.example.com}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/healthz}"
READY_URL="${READY_URL:-$BASE_URL/readyz}"
curl -fsS --max-time 5 "$HEALTH_URL" | grep -q '"status":"ok"'
curl -fsS --max-time 5 "$READY_URL" | grep -q '"status":"ok"'
echo "health ok: $HEALTH_URL; ready: $READY_URL"
