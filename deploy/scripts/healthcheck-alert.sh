#!/usr/bin/env bash
# Check /healthz + /readyz and email on state changes only.
# State is kept outside the repository by default.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="${ALERT_STATE_FILE:-/var/lib/campus/health-alert.state}"
BASE_URL="${PUBLIC_BASE_URL:-https://campus.example.com}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/healthz}"
READY_URL="${READY_URL:-$BASE_URL/readyz}"
mkdir -p "$(dirname "$STATE_FILE")"

previous="up"
[[ -f "$STATE_FILE" ]] && previous="$(cat "$STATE_FILE" 2>/dev/null || echo up)"
now="up"
detail=""
if ! detail="$(curl -fsS --max-time 8 "$HEALTH_URL" 2>&1)"; then
  now="down"; detail="healthz failed: $detail"
elif ! detail="$(curl -fsS --max-time 8 "$READY_URL" 2>&1)"; then
  now="down"; detail="readyz failed: $detail"
fi

if [[ "$now" == "down" && "$previous" != "down" ]]; then
  "$SCRIPT_DIR/send-alert-email.sh" "【校园社区】服务异常 $(date '+%F %T')" \
    "地址: $BASE_URL
状态: $now
$detail"
  echo down > "$STATE_FILE"
elif [[ "$now" == "up" && "$previous" == "down" ]]; then
  "$SCRIPT_DIR/send-alert-email.sh" "【校园社区】服务恢复 $(date '+%F %T')" \
    "地址: $BASE_URL
healthz 与 readyz 已恢复。"
  echo up > "$STATE_FILE"
else
  echo "$now" > "$STATE_FILE"
fi
