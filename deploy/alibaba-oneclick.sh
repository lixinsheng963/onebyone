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

PUBLIC_IP="$(curl -fsS https://api.ipify.org || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  read -r -p "未能自动获取公网 IP，请手动输入： " PUBLIC_IP
fi
read -r -p "域名（没有域名直接回车，将使用公网 IP ${PUBLIC_IP}）： " DOMAIN
BASE_URL="http://${DOMAIN:-$PUBLIC_IP}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@campus.local}"

rand_hex() { openssl rand -hex "$1"; }
MYSQL_PASSWORD="$(rand_hex 16)"
REDIS_PASSWORD="$(rand_hex 16)"
ADMIN_PASSWORD="$(rand_hex 16)"
SESSION_PEPPER="$(rand_hex 48)"
INVITE_CODE="$(rand_hex 8)"

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
ALLOW_DEMO_LOGIN=true
INVITE_CODE=${INVITE_CODE}
PUBLIC_BASE_URL=${BASE_URL}
APP_BASE_URL=${BASE_URL}
ADMIN_BASE_URL=${BASE_URL}

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
TRUST_PROXY=true

WX_APPID=
WX_SECRET=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4.1-flash
DEEPSEEK_THINKING=false

COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-guangzhou
COS_CDN_BASE=
EOF
chown campus:campus "$ENV_FILE"
chmod 600 "$ENV_FILE"

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

echo "==> 配置 Nginx"
cat > /etc/nginx/conf.d/campus.conf <<EOF
server {
    listen 80 default_server;
    server_name _;
    root ${ADMIN_DIST};
    index index.html;
    client_max_body_size 12m;
    server_tokens off;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Avoid the stock server block taking the default server.
rm -f /etc/nginx/conf.d/default.conf
if command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect 1 || true
fi
nginx -t
systemctl enable --now nginx
systemctl restart nginx

echo
echo "================ 部署完成 ================"
echo "后台：${BASE_URL}"
echo "管理邮箱：${ADMIN_EMAIL}"
echo "管理密码：${ADMIN_PASSWORD}"
echo "邀请码：${INVITE_CODE}"
echo "TOTP secret：${TOTP_SECRET}"
echo "TOTP URI：otpauth://totp/Campus:${ADMIN_EMAIL}?secret=${TOTP_SECRET}&issuer=Campus"
echo "MySQL：campus / ${MYSQL_PASSWORD}"
echo "Redis：${REDIS_PASSWORD}"
echo
echo "注意："
echo "1. 当前是 HTTP；正式环境必须配 HTTPS 后再把后台开放公网。"
echo "2. 没有域名时，微信真机无法把公网 IP 配成合法请求域名，只能先用开发者工具关闭域名校验测试。"
echo "3. COS 四项为空时图片会落在本地 ${API_DIR}/uploads；正式环境请填 COS。"
echo "4. ALLOW_DEMO_LOGIN=true 仅用于首次测试，接入微信 code2Session 后改为 false。"
echo "5. 阿里云安全组只开放 22/80/443，禁止开放 3306/6379。"
