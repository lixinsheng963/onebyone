# 校园日常分享小程序（单校版）

一个只记录“这一所学校今天发生的小事”的微信小程序。当前仓库是按四份产品/业务/开发/排版文档落地的单校版实现。

## 版本状态

- 当前版本：`v0.3.0-rc.13`（2026-11-22）
- 已跑通：小程序核心内容闭环、管理端 12 个栏目、MySQL 规范化持久化、Redis 限流、AI 文本/图片举报复核、邀请码准入、审计日志、RBAC/学校审核人、官方账号授权链与运营者绑定、用户治理、申诉、单人终审（全风险等级）、图片安全适配器、生产配置校验与压测。
- v0.3.0-rc.8 修复：移除 `app.json` 中非法的 `requiredPrivateInfos: openLocation`，解决微信开发者工具“模拟器启动失败”；新增 `pnpm check:mini`，上线前静态校验隐私字段、页面/图标/组件、事件处理函数和资源引用。
- v0.3.0-rc.13 完善：新用户先邀请码校验、再微信登录/资料授权，未授权时使用唯一随机 6 字昵称；未选择学校只能浏览，写操作统一提示并引导“我的”选择湖南人文科技学院，学校选择后锁定；移除注销账号，只保留退出登录并清理全部 `campus_*` 本地缓存；图片上传不再限制 20 张/小时。
- v0.3.0-rc.12 修复：学校审核员登录概览不再预取无权限的审核队列，概览“看配置”仅平台管理员可见；管理端启动先确认角色再渲染页面，避免学校/内容审核员首屏出现“API 连接失败：当前角色无权访问该功能”。
- v0.3.0-rc.11 完善：审核队列/官方运营者/举报双方头像链路继续补齐头像居中；申诉只允许本人被隐藏或未通过的内容，管理端拆分“待复核/已审核申诉”，平台管理员可兜底；首页通知角标和通知页每 5 秒轮询、回到页面立即刷新。
- v0.3.0-rc.10 完善：审核队列发布者、官方运营者、举报双方头像全链路；图片存储、MySQL、Redis 压力测试完成。
- v0.3.0-rc.9 完善：头像上传后帖子/评论/详情/个人主页/评论会话/管理端统一显示真实头像（匿名或未上传才回退首字）；评论三点菜单区分本人/他人并进入举报理由；分享键紧邻收藏键；发布按钮随页面滚动；评论匿名默认关闭。
- v0.3.0-rc.7 补齐：首页/热门/精选作者禁止自举报；微信式分享箭头、分享计数与 `POST /posts/:id/share`；详情评论内联输入框、评论三点菜单；话题长按删除与紧凑加号；地点地图选点/查看（经纬度持久化）；设置页头像昵称、按钮排版与安全清缓存；官方账号授权范围横排；通知日期中文化并禁用过去。
- 验证：API/admin build、WXML 16 文件、全部小程序 JS 语法、三套 e2e、安全 smoke 17 项、管理端 Playwright、21 个关键接口各 1000 请求/并发 100（0 错误）均通过。
- **当前是 Release Candidate，尚未完成正式线上部署。** 完整的上线阻断项、外部依赖、测试矩阵和完成定义见 [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md)。
- 距正式上线主要剩外部依赖与目标服务器验收：备案域名/HTTPS、正式微信 AppID、学校授权材料、图片审核供应商、真实备份恢复演练和真机验收。

## 目录

```text
apps/
  api/          NestJS API（MySQL 规范化业务表 + Redis，可回退 file/memory）
  admin/        Vue 3 + Vite 管理后台
  miniprogram/  微信原生小程序
database/       MySQL 初始化脚本
deploy/         Docker Compose / Nginx / MySQL / Redis 配置
previews/       管理后台登录/概览截图
*.md            四份源文档（仓库根目录）
```

## 本地启动

要求 Node.js 20+、pnpm。第一次使用可以先：

```bash
corepack enable
corepack prepare pnpm@11.28.5 --activate
```

Windows 也可以直接双击项目根目录的 `start-local.cmd`，它会打开 API 和管理后台两个终端。

手动启动：

```bash
pnpm install

# API：http://127.0.0.1:3000
pnpm dev:api

# 管理后台：http://127.0.0.1:5173
pnpm dev:admin

# 管理后台生产构建
pnpm --filter @campus/admin build
# 把 apps/admin/dist 放到 deploy/data/admin，Nginx 会托管
```

小程序用微信开发者工具打开 `apps/miniprogram`，AppID 可选“测试号”。默认使用本地 API（需先启动 `pnpm dev:api`，并在开发者工具关闭合法域名校验）；如果只想看 UI、不启动 API，把 `apps/miniprogram/utils/config.js` 的 `useRemote` 改回 `false`，就会使用本地 mock。

提交前运行小程序静态检查：

```bash
pnpm check:mini
node tools/check-wxml.mjs
```

`check:mini` 会校验 `app.json` 的 `requiredPrivateInfos` 合法字段、页面/图标/组件文件是否齐全、WXML 事件处理函数是否存在、JS/JSON 语法和内嵌资源引用；这类检查能在导入开发者工具前拦住“模拟器启动失败”。

## 阿里云单机一键部署

全新 Alibaba Cloud Linux 4、已备案域名（A 记录指向 ECS）、安全组已放行 80/443 时，可直接在服务器 root 终端执行：

```bash
rm -rf /tmp/campus-src && mkdir -p /tmp/campus-src
curl -fsSL https://codeload.github.com/lixinsheng963/onebyone/tar.gz/refs/heads/main \
  | tar -xz -C /tmp/campus-src --strip-components=1
sudo DOMAIN=agideepseek.vip ACME_EMAIL=2576264825@qq.com \
  SOURCE_DIR=/tmp/campus-src WX_APPID=wx... WX_SECRET=... \
  bash /tmp/campus-src/deploy/aliyun-fresh-deploy.sh
```

脚本会自动安装 Node 20、pnpm、MySQL 8、Redis、Nginx，用 acme.sh 签发 Let's Encrypt 证书，建库建用户，生成 `.env`/TOTP/管理员密码/首次邀请码，构建 API 与管理端，启动 systemd 并以公网 `/readyz` 验收。

项目已上传到服务器 `/opt/campus` 时，也可使用现有安装器（要求证书已存在）：

```bash
cd /opt/campus
sudo DOMAIN=campus.example.com \
  CERT_FULLCHAIN=/etc/letsencrypt/live/campus.example.com/fullchain.pem \
  CERT_KEY=/etc/letsencrypt/live/campus.example.com/privkey.pem \
  WX_APPID=wx... WX_SECRET=... \
  bash deploy/alibaba-oneclick.sh
```

`ALLOW_DEMO_LOGIN` 固定为 `false`；没有域名/证书/微信参数会拒绝执行。首次在生产服务器运行请把预检报错发回来。

## 安全

安全基线、已验证项、上线前清单和剩余风险见 [SECURITY.md](SECURITY.md)。  
上线前必须关闭演示登录、替换管理员凭据、配置 HTTPS 和 CORS 白名单。

## 图片与存储

- 不填 COS：图片保存到 `apps/api/uploads/`，由 API 的 `/uploads/...` 提供访问，适合本地开发。
- 填 COS：图片自动上传腾讯云 COS，返回签名 URL；数据库/快照只保存 `objectKey` 和元数据。当前签名有效期 7 天，正式长期运行建议改为“读取时重新签名”或接入 CDN 回源鉴权。
- `PUBLIC_BASE_URL`：本地默认 `http://127.0.0.1:3000`；用手机真机调试时改成电脑局域网地址，例如 `http://192.168.1.4:3000`（以电脑当前局域网 IPv4 为准）。
- 小程序上传接口：`POST /api/v1/media`（multipart，字段名 `file`），发布时传 `mediaIds`。
- 图片上传后会调用可配置的图片安全适配器（`IMAGE_SAFETY_URL`）：明确违规时删除文件并返回 400，审核服务不可用时返回 503；未配置适配器时保持人工审核。生产必须配置真实网关（微信 `mediaCheckAsync` 或等价服务）。

腾讯云 COS 四项：

```dotenv
COS_SECRET_ID=腾讯云 API 密钥 SecretId
COS_SECRET_KEY=腾讯云 API 密钥 SecretKey
COS_BUCKET=桶名-APPID，例如 campus-1250000000
COS_REGION=桶所在地域，例如 ap-guangzhou
# 可选：CDN 域名；长期运行建议配置，图片用固定 CDN URL
COS_CDN_BASE=
```

建议使用只授权该 COS 桶的子账号密钥，不要用主账号密钥，不要把密钥写进小程序。

## 部署演示（Docker Compose）

```bash
cp deploy/.env.example deploy/.env
# 按需修改密码；不要把真实密钥提交到仓库
pnpm --filter @campus/admin build
mkdir -p deploy/data/admin
cp -r apps/admin/dist/* deploy/data/admin/
docker compose -f deploy/docker-compose.yml up -d --build
```

访问 `http://服务器IP/` 进入管理后台，`/api/v1/...` 为 API。API 已支持 MySQL 规范化业务表（`DATA_MODE=mysql`，首次启动自动建表并迁移旧 `app_state` 快照）和 Redis 限流；未配置 MySQL 时仍可回退 `file`/`memory`。

正式环境请用 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 中的 Nginx HTTPS/systemd/备份脚本，而不是 Docker Compose 演示配置。生产启动会强制校验真实微信参数、HTTPS `PUBLIC_BASE_URL`、CORS 白名单、MySQL/Redis 和强密码，缺项直接拒绝启动。

## 账号与登录

- 本地演示：`ALLOW_DEMO_LOGIN=true` 时所有真机/微信号都会落到同一个演示账号 `u_me`，这不代表生产账号逻辑；要验证“不同微信号不同账号”，必须配置测试号/正式号的 `WX_APPID/WX_SECRET` 并设 `ALLOW_DEMO_LOGIN=false` 后重启 API。生产必须设为 `false`。
- 生产微信登录：配置 `WX_APPID/WX_SECRET`，并设置 `ALLOW_DEMO_LOGIN=false`，API 会调用微信 `code2Session`。
- 管理员账号：平台根账号由 `.env` 的 `ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_TOTP_SECRET` 初始化并同步到 `admin_users`（scrypt 哈希）；平台管理员可在“团队权限”创建内容审核员/学校审核人。根账号 env 兜底仅用于平台管理员，普通管理员登录以数据库账号为准。
- 管理后台已接真实 API：审核队列 1 秒、概览/举报 2 秒、其余页面 3-4 秒静默轮询；单飞、页面隐藏暂停、失败退避，发布后无需手动刷新。举报页展示内容和 AI 初筛详情；审核队列由一名有权限的审核员直接终审，审核记录保留在案件时间线中。
- 管理员 TOTP：`ADMIN_TOTP_SECRET` 必须是 Base32（A-Z2-7）；用 Authenticator 扫描 `otpauth://totp/Campus:admin@campus.local?secret=<secret>&issuer=Campus`。本地临时可用 `ADMIN_TOTP=123456` 并清空 secret。
- 邀请码与入学：客户端只接受管理后台发放的邀请码，旧的本地默认 `CAMPUS` 会在启动时自动吊销；MySQL `invite_codes` 已接入次数/过期/吊销校验，后台“邀请码”页可创建/吊销并实时显示已用次数，API 为 `GET/POST /api/v1/admin/invite-codes` 与 `POST /api/v1/admin/invite-codes/:id/revoke`。首次进入先校验邀请码（`POST /api/v1/auth/invite/check`），再登录并兑换；兑换后必须选择湖南人文科技学院才能发布、评论、点赞、收藏、举报、申诉或上传，未选学校只允许浏览。学校选择后锁定；退出登录会清理全部 `campus_*` 本地缓存。
- 官方账号：后台可新建/编辑组织、绑定真实运营者、上传授权文件、学校审核人初审、平台复核、暂停/换绑/到期自动失效；授权文件只允许管理员下载，不能匿名访问。未绑定运营者不能复核生效，避免占位账号发布。
- 运营手册：[docs/ADMIN-RUNBOOK.md](docs/ADMIN-RUNBOOK.md) 含官方账号、学校授权/审核人、团队权限的逐步操作与自测表；部署与监控见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
- 监控告警：`deploy/scripts/healthcheck-alert.sh` 检查 `/healthz` + `/readyz`，状态变化时通过 `send-alert-email.py`/`send-alert-email.sh` 发送邮件；默认收件人 `2576264825@qq.com`，需要在生产 env 配置 SMTP 地址/账号/授权码/发件人，实际发信以收件箱为准。
- 账号治理：后台“用户治理”支持禁言/封禁/恢复；小程序设置页只保留退出登录（清理全部 `campus_*` 缓存），注销账号入口已移除；举报/申诉/审核均留审计记录。
- 生产环境必须接入真实微信 `code2Session`、HTTPS、TOTP、MySQL、Redis、COS 与 DeepSeek。

## 已实现

- 小程序：首页（最新/热门/精选）、紧急通知、官方通知、详情、评论/回复、发布、认证、我的、通知、举报、申诉、设置、社区公约；“我的”支持朋友圈式发布列表、相关评论会话和即时取消收藏。
- API：登录、邀请码、feed、帖子、评论、点赞/收藏、阅读、通知、举报、`/me/posts`、`/me/favorites`、`/me/comment-threads`、后台审核/通知/热度配置
- 管理后台：概览、审核队列、用户治理、申诉复核、已审核申诉、官方账号、通知、举报、热度配置、邀请码、审计日志、团队权限
- 设计：纸张感、朱砂红、宋体标题、单列信息流、底部操作条

## 说明

- **数据模式**：`DATA_MODE=mysql`（推荐，24 张规范化业务表，自动建表并把旧 `app_state` 快照迁移到 user/post/comment/media 等表）、`file`（本地快照，重启不丢）、`memory`（纯内存，重启回种子）。MySQL 连接失败时回退本地文件；生产不要依赖回退。
- 旧 `app_state` 快照仍保留作迁移源/回滚参考，运行时不再以它为主。管理员账号、学校审核人、审计日志、通知槽位、邀请码、申诉、用户状态已写入 `admin_users`/`school_reviewers`/`audit_logs`/`notice_slot`/`invite_codes`/`appeals` 等规范化表。
- 自测脚本（先启动 API，workdir `apps/api`）：`node scripts/db-counts.mjs`；核心三阶段 `node scripts/e2e-mysql.mjs create` → 重启 API → `verify-delete` → 重启 → `check-clean`；后台三阶段 `node scripts/e2e-admin.mjs create/verify/check-clean`；邀请码两阶段 `node scripts/e2e-invite.mjs create` → 重启 → `node scripts/e2e-invite.mjs verify-clean`。
- AI 审核默认走本地规则；在 `apps/api/.env` 或根目录 `.env` 设置 `DEEPSEEK_API_KEY` 后可接 DeepSeek，失败自动降级为规则审核。举报会结合“举报原因 + 内容”做 AI 复核：明显不符自动驳回，明确色情/血腥/暴力/诈骗等或证据充分自动通过并隐藏内容，图片和证据不足转人工；后台可查看完整目标与 AI 依据。`.env` 已被 gitignore，**不要提交密钥**；如果 Key 曾在聊天/截图里出现，建议到控制台轮换。
- 微信文本内容安全：设置 `WX_APPID`、`WX_SECRET` 后 API 会调 `msgSecCheck`；测试号/未配置时自动跳过。
- 小程序图片和图标是本地生成的占位视觉，上线前替换为真实校园照片与学校授权素材。
- 四份源文档在仓库根目录，代码以文档为准；如文档与实现冲突，先改文档再改代码。
