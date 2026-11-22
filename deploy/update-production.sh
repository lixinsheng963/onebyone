#!/usr/bin/env bash
# Safe code update for an existing /opt/campus deployment.
# - Keeps .env, MySQL data, uploads and local authorization files.
# - Rebuilds API/admin, reloads systemd + nginx.
# - Optional: CLEAN_DEMO=1 removes the original demo/seed rows.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/campus}"
REPO_TARBALL="${REPO_TARBALL:-https://codeload.github.com/lixinsheng963/onebyone/tar.gz/refs/heads/main}"
TMP_DIR="${TMP_DIR:-/tmp/campus-update}"
CLEAN_DEMO="${CLEAN_DEMO:-0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 运行：sudo bash deploy/update-production.sh" >&2
  exit 1
fi
if [ ! -d "$APP_DIR/apps/api" ]; then
  echo "未找到 $APP_DIR/apps/api，请先完成首次部署。" >&2
  exit 1
fi

echo "==> 备份当前 env 与数据库"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a "$APP_DIR/apps/api/.env" "/root/campus-api.env.$STAMP" 2>/dev/null || true
if command -v mysqldump >/dev/null 2>&1 && [ -f "$APP_DIR/apps/api/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/apps/api/.env"
  set +a
  MYSQL_PWD="${MYSQL_PASSWORD:-}" mysqldump --protocol=TCP -h "${MYSQL_HOST:-127.0.0.1}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER}" --no-tablespaces --single-transaction "${MYSQL_DATABASE}" > "/root/campus-db.$STAMP.sql"
  echo "    DB backup: /root/campus-db.$STAMP.sql"
fi

echo "==> 下载最新源码"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP_DIR" --strip-components=1

echo "==> 同步代码（保留 .env/data/uploads/storage/node_modules）"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.env' --exclude 'data/' --exclude 'uploads/' --exclude 'storage/' \
    --exclude 'node_modules/' --exclude '.git/' --exclude 'logs/' \
    "$TMP_DIR/" "$APP_DIR/"
else
  # Fallback: copy only source trees that the app needs.
  cp -a "$TMP_DIR/apps/." "$APP_DIR/apps/"
  cp -a "$TMP_DIR/deploy/." "$APP_DIR/deploy/"
  cp -a "$TMP_DIR/database/." "$APP_DIR/database/"
  cp -a "$TMP_DIR/tools/." "$APP_DIR/tools/"
  cp -a "$TMP_DIR/package.json" "$TMP_DIR/pnpm-lock.yaml" "$TMP_DIR/pnpm-workspace.yaml" "$APP_DIR/"
fi

mkdir -p "$APP_DIR/apps/api/uploads" "$APP_DIR/apps/api/data" "$APP_DIR/apps/api/storage"
chown -R campus:campus "$APP_DIR/apps/api/uploads" "$APP_DIR/apps/api/data" "$APP_DIR/apps/api/storage"

cd "$APP_DIR"
echo "==> 安装依赖并构建"
pnpm install --frozen-lockfile
pnpm --filter @campus/api build
pnpm --filter @campus/admin build

if [ "$CLEAN_DEMO" = "1" ]; then
  echo "==> 停止 API，避免旧内存快照把演示数据写回"
  systemctl stop campus-api
  echo "==> 清除项目初始演示数据（保留真实用户 Simon 等）"
  (cd "$APP_DIR/apps/api" && node scripts/clean-demo-content.mjs --apply)
fi

echo "==> 重启 API 与 Nginx"
systemctl restart campus-api
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/readyz >/dev/null 2>&1; then break; fi
  sleep 1
done
nginx -t
systemctl reload nginx
curl -fsS --max-time 5 http://127.0.0.1:3000/readyz
echo
echo "更新完成。请刷新管理端并重新编译小程序。"
