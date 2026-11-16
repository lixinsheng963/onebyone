#!/usr/bin/env bash
# Alibaba Cloud Linux 4 / RHEL-like one-host installer.
# Prerequisite: project already uploaded to /opt/campus (without node_modules).
# Usage: sudo bash /opt/campus/deploy/alibaba-oneclick.sh
set -euo pipefail

APP_DIR="/opt/campus"
API_DIR="$APP_DIR/apps/api"
ADMIN_DIST="$APP_DIR/apps/admin/dist"
ENV_FILE="$API_DIR/.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 执行：sudo bash $0"
  exit 1
fi
if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "未找到 $APP_DIR/package.json"
  echo "请先把整个项目上传到 $APP_DIR，且不要上传 node_modules。"
  exit 1
fi

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  read -r -p "已备案域名（必须，例如 campus.example.com）： " DOMAIN
fi
if [[ -z "$DOMAIN" ]]; then
  echo "生产部署必须使用已备案域名和 HTTPS；已停止。" >&2
  exit 1
fi
BASE_URL="https://${DOMAIN}"
CERT_FULLCHAIN="${CERT_FULLCHAIN:-/etc/letsencrypt/live/${DOMAIN}/fullchain.pem}"
CERT_KEY="${CERT_KEY:-/etc/letsencrypt/live/${DOMAIN}/privkey.pem}"
if [[ ! -f "$CERT_FULLCHAIN" || ! -f "$CERT_KEY" ]]; then
  echo "未找到 TLS 证书：$CERT_FULLCHAIN / $CERT_KEY" >&2
  echo "请先签发证书，或通过 CERT_FULLCHAIN/CERT_KEY 指定路径。" >&2
  exit 1
fi
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@campus.local}"
WX_APPID="${WX_APPID:-}"
WX_SECRET="${WX_SECRET:-}"
if [[ -z "$WX_APPID" ]]; then
  read -r -p "正式微信小程序 AppID： " WX_APPID
fi
if [[ -z "$WX_SECRET" ]]; then
  read -r -s -p "正式微信小程序 AppSecret： " WX_SECRET
  echo
fi
if [[ -z "$WX_APPID" || -z "$WX_SECRET" ]]; then
  echo "生产环境必须配置 WX_APPID/WX_SECRET；已停止。" >&2
  exit 1
fi

rand_hex() { openssl rand -hex "$1"; }
MYSQL_PASSWORD="$(rand_hex 16)"
REDIS_PASSWORD="$(rand_hex 16)"
ADMIN_PASSWORD="$(rand_hex 16)"
SESSION_PEPPER="$(rand_hex 48)"
# Invite codes are issued from the admin console; do not seed a client-usable master code.
INVITE_CODE=""

echo "==> 安装基础软件"
dnf install -y curl ca-certificates git nginx mysql-server redis >/dev/null

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs >/dev/null
fi
corepack enable
corepack prepare pnpm@11.28.5 --activate

echo "==> 配置 MySQL"
systemctl enable --now mysqld
if mysql -uroot -e 'SELECT 1' >/dev/null 2>&1; then
  MYSQL_CMD=(mysql -uroot)
else
  read -r -s -p "本机 MySQL root 密码（没有密码直接回车）： " MYSQL_ROOT_PASSWORD
  echo
  MYSQL_CMD=(mysql -uroot)
  [[ -n "${MYSQL_ROOT_PASSWORD}" ]] && MYSQL_CMD+=("-p${MYSQL_ROOT_PASSWORD}")
fi
"${MYSQL_CMD[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS campus CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'campus'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER 'campus'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON campus.* TO 'campus'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> 配置 Redis"
REDIS_CONF="/etc/redis/redis.conf"
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' "$REDIS_CONF" 2>/dev/null || true
sed -i '/^requirepass /d' "$REDIS_CONF" 2>/dev/null || true
echo "requirepass ${REDIS_PASSWORD}" >> "$REDIS_CONF"
sed -i 's/^protected-mode .*/protected-mode yes/' "$REDIS_CONF" 2>/dev/null || true
sed -i 's/^appendonly .*/appendonly yes/' "$REDIS_CONF" 2>/dev/null || true
systemctl enable --now redis
systemctl restart redis
redis-cli -a "$REDIS_PASSWORD" ping >/dev/null

echo "==> 安装项目依赖并构建"
cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm --filter @campus/api build
pnpm --filter @campus/admin build
mkdir -p "$API_DIR/uploads" "$API_DIR/data"
if ! id campus >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /sbin/nologin campus
fi
chown -R campus:campus "$APP_DIR"
TOTP_SECRET="$(cd "$API_DIR" && node -e "console.log(require('otplib').generateSecret())" 2>/dev/null || true)"
if [[ -z "$TOTP_SECRET" ]]; then
  echo "无法生成 TOTP secret，请手动执行：cd $API_DIR && node -e \"console.log(require('otplib').generateSecret())\""
  exit 1
fi

echo "==> 生成生产 .env"
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
fi
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DATA_MODE=mysql
AUTO_PUBLISH_SAFE=true
ALLOW_DEMO_LOGIN=false
INVITE_CODE=${INVITE_CODE}
PUBLIC_BASE_URL=${BASE_URL}
APP_BASE_URL=${BASE_URL}
ADMIN_BASE_URL=${BASE_URL}
RATE_LIMIT_MAX=300
TRUST_PROXY=true

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=campus
MYSQL_USER=campus
MYSQL_PASSWORD=${MYSQL_PASSWORD}

REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_TOTP=
ADMIN_TOTP_SECRET=${TOTP_SECRET}
ADMIN_SESSION_HOURS=12
USER_SESSION_TTL_DAYS=30
SESSION_PEPPER=${SESSION_PEPPER}
CORS_ORIGINS=${BASE_URL}

WX_APPID=${WX_APPID}
WX_SECRET=${WX_SECRET}
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4.1-flash
DEEPSEEK_THINKING=false
IMAGE_SAFETY_URL=
IMAGE_SAFETY_TOKEN=
IMAGE_SAFETY_TIMEOUT_MS=5000

COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-guangzhou
COS_CDN_BASE=
EOF
chown campus:campus "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "==> 生产预检（启动前）"
if ! PREFLIGHT_SKIP_NETWORK=1 bash "$APP_DIR/deploy/scripts/preflight-production.sh" "$ENV_FILE"; then
  echo "生产预检失败，未启动 API；请修复后重新执行。" >&2
  exit 1
fi

echo "==> 配置 systemd"
cat > /etc/systemd/system/campus-api.service <<EOF
[Unit]
Description=Campus Daily API
After=network.target mysqld.service redis.service
Wants=mysqld.service redis.service

[Service]
Type=simple
User=campus
Group=campus
WorkingDirectory=${API_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=$(command -v node) dist/main.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now campus-api
systemctl restart campus-api
sleep 3
if ! systemctl is-active --quiet campus-api; then
  echo "API 启动失败，最近日志："
  journalctl -u campus-api -n 60 --no-pager
  exit 1
fi

echo "==> 配置 Nginx（HTTPS）"
mkdir -p /var/www/campus/admin
cp -r "$ADMIN_DIST"/* /var/www/campus/admin/
sed \
  -e "s/campus\.example\.com/${DOMAIN}/g" \
  -e "s#/etc/nginx/ssl/campus\.fullchain\.pem#${CERT_FULLCHAIN}#g" \
  -e "s#/etc/nginx/ssl/campus\.key#${CERT_KEY}#g" \
  -e "s#/var/www/campus/admin#/var/www/campus/admin#g" \
  "$APP_DIR/deploy/nginx/production.conf" > /etc/nginx/conf.d/campus.conf

# Avoid the stock server block taking the default server.
rm -f /etc/nginx/conf.d/default.conf
if command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect 1 || true
fi
nginx -t
systemctl enable --now nginx
systemctl restart nginx

if ! bash "$APP_DIR/deploy/scripts/preflight-production.sh" "$ENV_FILE"; then
  echo "公网预检失败：请检查 DNS、HTTPS 证书、安全组 443 和 Nginx；API 已启动但不要开放流量。" >&2
  exit 1
fi

echo
echo "================ 部署完成 ================"
echo "后台：${BASE_URL}"
echo "管理邮箱：${ADMIN_EMAIL}"
echo "管理密码：${ADMIN_PASSWORD}"
echo "邀请码：请登录管理后台“邀请码”页创建（客户端不再接受默认码）"
echo "TOTP secret：${TOTP_SECRET}"
echo "TOTP URI：otpauth://totp/Campus:${ADMIN_EMAIL}?secret=${TOTP_SECRET}&issuer=Campus"
echo "MySQL：campus / ${MYSQL_PASSWORD}"
echo "Redis：${REDIS_PASSWORD}"
echo
echo "注意："
echo "1. 已配置 HTTPS；请确认微信后台 request/uploadFile 合法域名包含 ${DOMAIN}。"
echo "2. 微信正式 AppID 已写入；ALLOW_DEMO_LOGIN=false。"
echo "3. COS 四项为空时图片会落在本地 ${API_DIR}/uploads；正式环境建议填 COS。"
echo "4. 图片安全网关 IMAGE_SAFETY_URL 为空时仅人工审核；建议上线前配置。"
echo "5. 阿里云安全组只开放 22/80/443，禁止开放 3306/6379。"
echo "6. 以上密码/TOTP 只显示一次，请立即保存并删除终端记录。"
