#!/usr/bin/env bash
# Fresh Alibaba Cloud Linux 4 (RHEL-like) one-host deployment.
# Run as root on the ECS instance:
#   DOMAIN=agideepseek.vip ACME_EMAIL=2576264825@qq.com \
#   WX_APPID=... WX_SECRET=... bash aliyun-fresh-deploy.sh
#
# It installs Node 20, pnpm, MySQL 8, Redis, Nginx, obtains a Let's Encrypt
# certificate with acme.sh, builds the monorepo and starts campus-api.
# The DNS A record and ECS security-group ports 80/443 must already be ready.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/campus}"
DOMAIN="${DOMAIN:-agideepseek.vip}"
ACME_EMAIL="${ACME_EMAIL:-2576264825@qq.com}"
REPO_URL="${REPO_URL:-https://github.com/lixinsheng963/onebyone.git}"
CERT_DIR="/etc/nginx/ssl"
CERT_FULLCHAIN="$CERT_DIR/${DOMAIN}.fullchain.pem"
CERT_KEY="$CERT_DIR/${DOMAIN}.key"
API_DIR="$APP_DIR/apps/api"
ENV_FILE="$API_DIR/.env"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@campus.local}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 执行：sudo DOMAIN=$DOMAIN bash $0" >&2
  exit 1
fi

if [[ -z "${WX_APPID:-}" ]]; then
  read -r -p "微信小程序 AppID（测试号或正式号）： " WX_APPID
fi
if [[ -z "${WX_SECRET:-}" ]]; then
  read -r -s -p "微信小程序 AppSecret： " WX_SECRET
  echo
fi
[[ -n "$WX_APPID" && -n "$WX_SECRET" ]] || { echo "必须提供微信 AppID/Secret。" >&2; exit 1; }

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v dnf >/dev/null || die "此脚本只适用于 Alibaba Cloud Linux 4 / RHEL 系（需要 dnf）。"

log "检查 DNS 与 80/443 端口占用"
if ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE ':(80|443)$'; then
  ss -lntp | grep -E ':(80|443)' || true
  die "80/443 已被占用，请先停止占用服务（例如宝塔 Nginx），再执行本脚本。"
fi
PUBLIC_IP="$(curl -4fsS --max-time 3 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || true)"
[[ -n "$PUBLIC_IP" ]] || PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
DNS_IPS="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
echo "服务器公网 IP：${PUBLIC_IP:-未知}"
echo "域名解析 A：${DNS_IPS:-未解析}"
if [[ -z "$PUBLIC_IP" || -z "$DNS_IPS" || "$DNS_IPS" != *"$PUBLIC_IP"* ]]; then
  echo
  echo "域名尚未指向本机，或 DNS 未生效。"
  echo "请到阿里云 DNS 控制台为 $DOMAIN 添加 A 记录 -> $PUBLIC_IP，并等待生效。"
  echo "确认解析后重新执行本脚本。"
  exit 1
fi

log "安装基础软件"
dnf install -y curl ca-certificates git tar xz openssl socat nginx mysql-server redis >/dev/null
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
systemctl enable --now mysqld 2>/dev/null || systemctl enable --now mysql
systemctl enable --now redis

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]]; then
  dnf install -y nodejs >/dev/null 2>&1 || true
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]]; then
  NODE_VERSION="v20.18.0"
  case "$(uname -m)" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *) die "不支持的 CPU 架构: $(uname -m)" ;;
  esac
  NODE_TARBALL="node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  NODE_BASE="https://nodejs.org/dist/${NODE_VERSION}"
  if ! curl -fsSL --max-time 120 "${NODE_BASE}/${NODE_TARBALL}" -o "/tmp/${NODE_TARBALL}"; then
    curl -fsSL --max-time 120 "https://npmmirror.com/mirrors/node/${NODE_VERSION}/${NODE_TARBALL}" -o "/tmp/${NODE_TARBALL}"
  fi
  mkdir -p /usr/local/lib/nodejs
  tar -xJf "/tmp/${NODE_TARBALL}" -C /usr/local/lib/nodejs
  ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/node" /usr/local/bin/node
  ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npm" /usr/local/bin/npm
  ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npx" /usr/local/bin/npx
  export PATH="/usr/local/bin:${PATH}"
  hash -r
fi
node -v
if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@11.28.5 --activate
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@11.28.5
fi
pnpm --version

log "申请 HTTPS 证书（Let's Encrypt / acme.sh）"
mkdir -p "$CERT_DIR"
if [[ ! -s "$CERT_FULLCHAIN" || ! -s "$CERT_KEY" ]]; then
  curl -fsSL https://get.acme.sh | sh -s email="$ACME_EMAIL"
  ACME="/root/.acme.sh/acme.sh"
  "$ACME" --set-default-ca --server letsencrypt >/dev/null
  "$ACME" --issue -d "$DOMAIN" --standalone --keylength ec-256 \
    --pre-hook "systemctl stop nginx 2>/dev/null || true" \
    --post-hook "systemctl start nginx 2>/dev/null || true" \
    --force
  "$ACME" --install-cert -d "$DOMAIN" --ecc \
    --key-file "$CERT_KEY" \
    --fullchain-file "$CERT_FULLCHAIN" \
    --reloadcmd "systemctl reload nginx 2>/dev/null || true"
fi
[[ -s "$CERT_FULLCHAIN" && -s "$CERT_KEY" ]] || die "证书申请失败，请检查 DNS、安全组 80 端口和域名备案状态。"

log "配置 MySQL 8"
MYSQL_PASSWORD="$(openssl rand -hex 16)"
REDIS_PASSWORD="$(openssl rand -hex 16)"
ADMIN_PASSWORD="$(openssl rand -hex 16)"
SESSION_PEPPER="$(openssl rand -hex 48)"
MYSQL_CMD=(mysql -uroot)
if ! mysql -uroot -e 'SELECT 1' >/dev/null 2>&1; then
  read -r -s -p "本机 MySQL root 密码（没有密码直接回车）： " MYSQL_ROOT_PASSWORD
  echo
  MYSQL_CMD=(mysql -uroot)
  [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] && MYSQL_CMD+=("-p${MYSQL_ROOT_PASSWORD}")
fi
"${MYSQL_CMD[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS campus CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'campus'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
CREATE USER IF NOT EXISTS 'campus'@'127.0.0.1' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER 'campus'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER 'campus'@'127.0.0.1' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON campus.* TO 'campus'@'localhost';
GRANT ALL PRIVILEGES ON campus.* TO 'campus'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

log "配置 Redis"
REDIS_CONF="/etc/redis/redis.conf"
[[ -f "$REDIS_CONF" ]] || REDIS_CONF="/etc/redis.conf"
[[ -f "$REDIS_CONF" ]] || die "未找到 redis.conf。"
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' "$REDIS_CONF" || true
sed -i '/^requirepass /d' "$REDIS_CONF" || true
echo "requirepass ${REDIS_PASSWORD}" >> "$REDIS_CONF"
sed -i 's/^protected-mode .*/protected-mode yes/' "$REDIS_CONF" || true
sed -i 's/^appendonly .*/appendonly yes/' "$REDIS_CONF" || true
systemctl enable --now redis
systemctl restart redis
redis-cli -a "$REDIS_PASSWORD" ping >/dev/null

log "下载并构建项目"
if [[ -n "${SOURCE_DIR:-}" ]]; then
  [[ -d "$SOURCE_DIR" ]] || { echo "SOURCE_DIR 不存在: $SOURCE_DIR" >&2; exit 1; }
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  cp -a "$SOURCE_DIR/." "$APP_DIR/"
elif [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  mkdir -p "$APP_DIR"
  if ! git clone --depth 1 "$REPO_URL" "$APP_DIR"; then
    echo "GitHub clone 失败，改用 codeload 源码包..." >&2
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR"
    curl -fsSL "https://codeload.github.com/lixinsheng963/onebyone/tar.gz/refs/heads/main" -o /tmp/campus-main.tar.gz
    tar -xzf /tmp/campus-main.tar.gz --strip-components=1 -C "$APP_DIR"
    rm -f /tmp/campus-main.tar.gz
  fi
fi
cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm --filter @campus/api build
pnpm --filter @campus/admin build

log "创建运行用户与目录"
id campus >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /sbin/nologin campus
mkdir -p "$API_DIR/uploads" "$API_DIR/data" /var/www/campus/admin
rm -rf /var/www/campus/admin/*
cp -r "$APP_DIR/apps/admin/dist"/* /var/www/campus/admin/
chown -R campus:campus "$APP_DIR" "$API_DIR/uploads" "$API_DIR/data"
chmod 755 /var/www/campus/admin

TOTP_SECRET="$(cd "$API_DIR" && node -e "console.log(require('otplib').generateSecret())")"
[[ -n "$TOTP_SECRET" ]] || die "生成 TOTP secret 失败。"
BOOTSTRAP_INVITE="WELCOME-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')"

log "生成生产 .env"
if [[ -f "$ENV_FILE" ]]; then cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"; fi
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DATA_MODE=mysql
AUTO_PUBLISH_SAFE=true
ALLOW_DEMO_LOGIN=false
INVITE_CODE=${BOOTSTRAP_INVITE}
INVITE_MAX_USES=1
PUBLIC_BASE_URL=https://${DOMAIN}
APP_BASE_URL=https://${DOMAIN}
ADMIN_BASE_URL=https://${DOMAIN}
CORS_ORIGINS=https://${DOMAIN}
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
ADMIN_DISPLAY_NAME=平台管理员
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_TOTP=
ADMIN_TOTP_SECRET=${TOTP_SECRET}
ADMIN_SESSION_HOURS=12
USER_SESSION_TTL_DAYS=30
SESSION_PEPPER=${SESSION_PEPPER}

WX_APPID=${WX_APPID}
WX_SECRET=${WX_SECRET}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL:-deepseek-v4.1-flash}
DEEPSEEK_THINKING=false
IMAGE_SAFETY_URL=${IMAGE_SAFETY_URL:-}
IMAGE_SAFETY_TOKEN=${IMAGE_SAFETY_TOKEN:-}
IMAGE_SAFETY_TIMEOUT_MS=5000

COS_SECRET_ID=${COS_SECRET_ID:-}
COS_SECRET_KEY=${COS_SECRET_KEY:-}
COS_BUCKET=${COS_BUCKET:-}
COS_REGION=${COS_REGION:-ap-guangzhou}
COS_CDN_BASE=${COS_CDN_BASE:-}
EOF
chown campus:campus "$ENV_FILE"
chmod 600 "$ENV_FILE"

log "配置 systemd"
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
sleep 4
systemctl is-active --quiet campus-api || { journalctl -u campus-api -n 80 --no-pager; die "API 启动失败。"; }

log "配置 Nginx HTTPS"
sed \
  -e "s/campus\.example\.com/${DOMAIN}/g" \
  -e "s#/etc/nginx/ssl/campus\.fullchain\.pem#${CERT_FULLCHAIN}#g" \
  -e "s#/etc/nginx/ssl/campus\.key#${CERT_KEY}#g" \
  "$APP_DIR/deploy/nginx/production.conf" > /etc/nginx/conf.d/campus.conf
rm -f /etc/nginx/conf.d/default.conf
if command -v setsebool >/dev/null 2>&1; then setsebool -P httpd_can_network_connect 1 || true; fi
nginx -t
systemctl enable --now nginx
systemctl restart nginx

if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http >/dev/null || true
  firewall-cmd --permanent --add-service=https >/dev/null || true
  firewall-cmd --reload >/dev/null || true
fi

log "公网可用性检查"
curl -fsS "https://${DOMAIN}/readyz" >/dev/null || die "HTTPS /readyz 失败：请检查阿里云安全组 80/443、Nginx 和 DNS。"
curl -fsS "https://${DOMAIN}/healthz" >/dev/null || die "HTTPS /healthz 失败。"

cat <<EOF

================ 部署完成 ================
后台：https://${DOMAIN}/
管理邮箱：${ADMIN_EMAIL}
管理密码：${ADMIN_PASSWORD}
TOTP secret：${TOTP_SECRET}
TOTP URI：otpauth://totp/Campus:${ADMIN_EMAIL}?secret=${TOTP_SECRET}&issuer=Campus
首次邀请码（单次）：${BOOTSTRAP_INVITE}
MySQL：campus / ${MYSQL_PASSWORD}
Redis：${REDIS_PASSWORD}

下一步：
1. 打开 https://${DOMAIN}/ ，用上面的邮箱、密码和 TOTP 登录后台。
2. 在“邀请码”创建正式邀请码；首次邀请码只能用一次。
3. 微信公众平台/测试号后台把 https://${DOMAIN} 加入 request 合法域名。
4. 把 apps/miniprogram/utils/config.js 的 baseUrl 改为 https://${DOMAIN}/api/v1 后重新编译。
5. 阿里云安全组只需开放 22/80/443；不要开放 3306/6379。

注意：以上密码/TOTP/邀请码只显示一次，请立即保存。
EOF
