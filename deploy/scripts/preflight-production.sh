#!/usr/bin/env bash
# Production preflight for a single-node Campus deployment.
# Usage: ./preflight-production.sh /opt/campus/apps/api/.env
# Never prints secret values.
set -euo pipefail

ENV_FILE="${1:-/opt/campus/apps/api/.env}"
FAIL=0
WARN=0

ok()   { printf '  OK   %s\n' "$1"; }
warn() { printf '  WARN %s\n' "$1"; WARN=$((WARN + 1)); }
bad()  { printf '  FAIL %s\n' "$1"; FAIL=$((FAIL + 1)); }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then ok "command $1"; else bad "missing command: $1"; fi
}

echo "Campus production preflight"
echo "env: $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  echo "  FAIL env file not found"
  exit 1
fi

# Load configuration without exporting it to child output.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

for key in NODE_ENV ALLOW_DEMO_LOGIN WX_APPID WX_SECRET SESSION_PEPPER \
  ADMIN_EMAIL ADMIN_PASSWORD ADMIN_TOTP_SECRET CORS_ORIGINS PUBLIC_BASE_URL \
  DATA_MODE REDIS_ENABLED TRUST_PROXY MYSQL_HOST MYSQL_PORT MYSQL_DATABASE \
  MYSQL_USER MYSQL_PASSWORD; do
  value="${!key:-}"
  if [ -z "$value" ]; then bad "missing env: $key"; else ok "env set: $key"; fi
done

[ "${NODE_ENV:-}" = "production" ] && ok "NODE_ENV=production" || bad "NODE_ENV must be production"
[ "${ALLOW_DEMO_LOGIN:-}" = "false" ] && ok "demo login disabled" || bad "ALLOW_DEMO_LOGIN must be false"
[ "${DATA_MODE:-}" = "mysql" ] && ok "DATA_MODE=mysql" || bad "DATA_MODE must be mysql"
[ "${REDIS_ENABLED:-}" = "true" ] && ok "REDIS_ENABLED=true" || bad "REDIS_ENABLED must be true"
[ "${TRUST_PROXY:-}" = "true" ] && ok "TRUST_PROXY=true" || bad "TRUST_PROXY must be true"

case "${PUBLIC_BASE_URL:-}" in
  https://*) ok "PUBLIC_BASE_URL is HTTPS" ;;
  *) bad "PUBLIC_BASE_URL must start with https://" ;;
esac
case "${CORS_ORIGINS:-}" in
  *localhost*|*127.0.0.1*) bad "CORS_ORIGINS contains localhost" ;;
  *) ok "CORS_ORIGINS has no localhost" ;;
esac

pepper_len="${#SESSION_PEPPER}"
password_len="${#ADMIN_PASSWORD}"
totp_len="${#ADMIN_TOTP_SECRET}"
[ "$pepper_len" -ge 32 ] && ok "SESSION_PEPPER >= 32 chars" || bad "SESSION_PEPPER must be >= 32 chars"
[ "$password_len" -ge 12 ] && ok "ADMIN_PASSWORD >= 12 chars" || bad "ADMIN_PASSWORD must be >= 12 chars"
case "${ADMIN_TOTP_SECRET:-}" in
  *[!A-Z2-7]*) bad "ADMIN_TOTP_SECRET must be Base32 (A-Z2-7)" ;;
  *) [ "$totp_len" -ge 16 ] && ok "ADMIN_TOTP_SECRET is Base32" || bad "ADMIN_TOTP_SECRET too short" ;;
esac

for cmd in node pnpm mysql mysqladmin redis-cli nginx curl openssl systemctl; do
  require_cmd "$cmd"
done

if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 20 ] && ok "Node.js >= 20 ($(node -v 2>/dev/null))" || bad "Node.js 20+ required"
fi

if command -v mysqladmin >/dev/null 2>&1; then
  if MYSQL_PWD="${MYSQL_PASSWORD:-}" mysqladmin --protocol=TCP \
      --host="${MYSQL_HOST:-127.0.0.1}" --port="${MYSQL_PORT:-3306}" \
      --user="${MYSQL_USER:-campus}" ping --silent >/dev/null 2>&1; then
    ok "MySQL reachable"
  else
    bad "MySQL ping failed"
  fi
fi

if command -v redis-cli >/dev/null 2>&1; then
  REDISCLI_AUTH="${REDIS_PASSWORD:-}" redis-cli -h "${REDIS_HOST:-127.0.0.1}" \
    -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG \
    && ok "Redis reachable" || bad "Redis ping failed"
fi

if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then ok "nginx configuration valid"; else bad "nginx -t failed"; fi
fi

avail_kb="$(df -Pk /opt/campus 2>/dev/null | awk 'NR==2 {print $4}' || true)"
if [ -n "${avail_kb:-}" ]; then
  if [ "$avail_kb" -ge 2097152 ]; then ok ">= 2 GB free on /opt/campus"; else bad "less than 2 GB free on /opt/campus"; fi
fi

if command -v curl >/dev/null 2>&1 && [ "${PREFLIGHT_SKIP_NETWORK:-0}" != "1" ]; then
  if curl -fsS --max-time 8 "${PUBLIC_BASE_URL%/}/readyz" | grep -q '"status":"ok"'; then
    ok "public /readyz is ready"
  else
    bad "public /readyz did not report ok"
  fi
fi

echo
if [ "$FAIL" -gt 0 ]; then
  echo "preflight failed: $FAIL blocking issue(s), $WARN warning(s)"
  exit 1
fi
echo "preflight passed: $WARN warning(s)"
