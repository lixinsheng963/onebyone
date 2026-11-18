#!/usr/bin/env bash
# Send one plain-text alert through an SMTP relay.
# Required: ALERT_SMTP_URL, ALERT_SMTP_USER, ALERT_SMTP_PASS, ALERT_EMAIL_FROM, ALERT_EMAIL_TO.
# For QQ Mail use an authorization code (not the login password) and smtps://smtp.qq.com:465.
set -euo pipefail

subject="${1:-Campus alert}"
body="${2:-No details provided}"
to="${ALERT_EMAIL_TO:-2576264825@qq.com}"
from="${ALERT_EMAIL_FROM:-}"
url="${ALERT_SMTP_URL:-smtps://smtp.qq.com:465}"
user="${ALERT_SMTP_USER:-}"
pass="${ALERT_SMTP_PASS:-}"

if [[ "${ALERT_DRY_RUN:-0}" == "1" ]]; then
  printf 'DRY RUN\nTo: %s\nFrom: %s\nSubject: %s\n\n%s\n' "$to" "${from:-<unset>}" "$subject" "$body"
  exit 0
fi

: "${from:?ALERT_EMAIL_FROM is required}"
: "${user:?ALERT_SMTP_USER is required}"
: "${pass:?ALERT_SMTP_PASS is required (QQ Mail authorization code)}"

subject="${subject//$'\r'/ }"
subject="${subject//$'\n'/ }"
work="$(mktemp)"
trap 'rm -f "$work"' EXIT
{
  printf 'From: %s\r\n' "$from"
  printf 'To: %s\r\n' "$to"
  printf 'Subject: %s\r\n' "$subject"
  printf 'MIME-Version: 1.0\r\n'
  printf 'Content-Type: text/plain; charset=UTF-8\r\n'
  printf 'Content-Transfer-Encoding: 8bit\r\n\r\n'
  printf '%s\r\n' "$body"
} > "$work"

curl --silent --show-error --fail \
  --url "$url" --ssl-reqd \
  --user "$user:$pass" \
  --mail-from "$from" --mail-rcpt "$to" \
  --upload-file "$work"
