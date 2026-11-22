# 生产部署手册

## 0. 全新阿里云 ECS 一键部署

适用：Alibaba Cloud Linux 4、全新实例、已备案域名、测试号或正式微信小程序。
脚本会自动安装 Node 20、pnpm、MySQL 8、Redis、Nginx，使用 acme.sh 申请 Let's Encrypt 证书，构建 API/管理端并启动 systemd 服务。

```bash
# 在 ECS 的 root 终端执行（域名 A 记录必须已指向本机，安全组已放行 80/443）
curl -fsSL https://cdn.jsdelivr.net/gh/lixinsheng963/onebyone@main/deploy/aliyun-fresh-deploy.sh -o /tmp/campus-deploy.sh
sudo DOMAIN=agideepseek.vip ACME_EMAIL=2576264825@qq.com \
  WX_APPID=你的AppID WX_SECRET=你的AppSecret \
  bash /tmp/campus-deploy.sh
```

如果 `raw.githubusercontent.com` 在当前网络不可达，先在能访问 GitHub 的电脑下载该文件，再通过宝塔面板/SCP 上传到 ECS 后执行。

脚本结束会打印管理端地址、管理员密码、TOTP secret、首次邀请码、MySQL 和 Redis 密码。**只显示一次，请立即保存。**

部署完成后还需要：

1. 在微信公众平台/测试号后台，把 `https://agideepseek.vip` 加入 request 合法域名；
2. 把 `apps/miniprogram/utils/config.js` 的 `baseUrl` 改为 `https://agideepseek.vip/api/v1`，重新编译；
3. 阿里云安全组只开放 22/80/443，不要开放 3306/6379；
4. 用首次邀请码完成小程序注册，再在管理端邀请码页创建后续邀请码。

## 1. 前置条件

- 一台 2C4G 以上 Linux 服务器（阿里云 Linux 4 / Ubuntu 22.04）。
- 已备案域名，HTTPS 证书（fullchain + key）。
- 微信小程序 AppID/AppSecret，且服务器域名加入微信 request 合法域名。
- MySQL 8/9、Redis 7、Node.js 20+、pnpm。
- 可选：腾讯云 COS 私有桶 + CDN；DeepSeek API Key；图片审核网关。

## 2. 后端

```bash
cd /opt/campus
pnpm install --frozen-lockfile
pnpm --filter @campus/api build
cp deploy/env.production.example apps/api/.env
# 编辑 apps/api/.env：数据库密码、SESSION_PEPPER、ADMIN_PASSWORD、TOTP、WX/COS/DeepSeek
node -e "const {generateSecret}=require('otplib'); console.log(generateSecret())" # 写入 ADMIN_TOTP_SECRET
```

启动前 API 会自动建表/迁移。生产模式缺少必填项会拒绝启动。

先跑生产预检；它会检查环境变量、Node/MySQL/Redis/Nginx、磁盘、HTTPS 和 readiness，失败会阻止上线：

```bash
chmod +x deploy/scripts/*.sh
sudo ./deploy/scripts/preflight-production.sh /opt/campus/apps/api/.env
```

```bash
sudo cp deploy/systemd/campus-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now campus-api
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/readyz
```

`/healthz` 只表示进程存活；`/readyz` 会检查 MySQL 和 Redis，任一不可用时返回 503。Nginx/监控应以 `/readyz` 为准。

## 3. 管理后台与 Nginx

```bash
pnpm --filter @campus/admin build
sudo mkdir -p /var/www/campus/admin
sudo cp -r apps/admin/dist/* /var/www/campus/admin/
sudo cp deploy/nginx/production.conf /etc/nginx/conf.d/campus.conf
# 替换 campus.example.com 与证书路径
sudo nginx -t && sudo systemctl reload nginx
```

首次登录使用 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / TOTP。进入“团队权限”创建学校审核人/内容审核员，不要把平台管理员账号发给学校。

## 4. 备份与监控

```bash
sudo mkdir -p /var/backups/campus
sudo crontab -e
# 30 3 * * * MYSQL_PASSWORD=... /opt/campus/deploy/scripts/backup-mysql.sh
# */5 * * * * PUBLIC_BASE_URL=https://campus.example.com /opt/campus/deploy/scripts/healthcheck.sh
```

定期在测试库执行 `restore-mysql.sh` 验证备份可用。监控项至少包含：API 5xx、P95 延迟、MySQL 连接数、Redis 内存、磁盘、备份结果。

## 5. 小程序

修改 `apps/miniprogram/utils/config.js` 的 `baseUrl` 为 `https://campus.example.com/api/v1`，在微信开发者工具上传体验版，配置 request/uploadFile 合法域名，完成隐私协议与内容安全声明。

## 6. 上线检查

- `NODE_ENV=production`、`ALLOW_DEMO_LOGIN=false`、真实微信登录成功。
- 管理员 TOTP 可登录，学校审核人只能看本校官方账号。
- 发帖→审核队列 1 秒内出现→平台/学校审核链路正确。
- 举报 AI 驳回/人工隐藏、申诉恢复、注销、禁言、封禁均验证。
- 图片审核网关已配置（`IMAGE_SAFETY_URL`），未配置时仅允许人工审核。
- 备份、恢复、健康检查、日志轮转已配置。
- 压力测试与全量 e2e 通过。

## 监控告警

`deploy/scripts/healthcheck-alert.sh` 同时检查 `/healthz` 与 `/readyz`，状态变化时调用 `send-alert-email.sh` 发送邮件。生产 env 配置 `ALERT_SMTP_URL`、`ALERT_SMTP_USER`、`ALERT_SMTP_PASS`（QQ 邮箱授权码）、`ALERT_EMAIL_FROM`、`ALERT_EMAIL_TO=2576264825@qq.com`；先用 `ALERT_DRY_RUN=1` 验证，再安装 `campus-healthcheck.timer`。
