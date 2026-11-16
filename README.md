# 校园日常分享小程序（单校版）

一个只记录“这一所学校今天发生的小事”的微信小程序。当前仓库是按四份产品/业务/开发/排版文档落地的单校版实现。

## 版本状态

- 当前版本：`v0.2.0-preproduction`（2026-11-16）
- 已跑通：小程序核心内容闭环、管理端八个栏目、MySQL 规范化持久化、Redis 限流、AI 文本审核/举报复核、邀请码、审计日志、自动化 e2e 与安全 smoke。
- **尚未达到正式上线标准。** 完整的上线阻断项、外部依赖、测试矩阵和完成定义见 [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md)。
- 当前重点不是继续堆功能，而是补齐官方账号授权/学校审核人、账号治理、注销/申诉、双人复核、图片内容安全、生产 HTTPS/真实微信登录、并发压测与备份监控。

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

## 阿里云单机一键部署

项目上传到服务器 `/opt/campus` 后执行：

```bash
sudo bash /opt/campus/deploy/alibaba-oneclick.sh
```

脚本会安装 Node、pnpm、MySQL、Redis、Nginx，创建数据库/用户，生成 `.env`、TOTP 和密码，构建 API/管理后台，配置 systemd 与 Nginx。脚本未在没有目标服务器的情况下实际执行，首次运行请把报错发回来。

## 安全

安全基线、已验证项、上线前清单和剩余风险见 [SECURITY.md](SECURITY.md)。  
上线前必须关闭演示登录、替换管理员凭据、配置 HTTPS 和 CORS 白名单。

## 图片与存储

- 不填 COS：图片保存到 `apps/api/uploads/`，由 API 的 `/uploads/...` 提供访问，适合本地开发。
- 填 COS：图片自动上传腾讯云 COS，返回签名 URL；数据库/快照只保存 `objectKey` 和元数据。当前签名有效期 7 天，正式长期运行建议改为“读取时重新签名”或接入 CDN 回源鉴权。
- `PUBLIC_BASE_URL`：本地默认 `http://127.0.0.1:3000`；用手机真机调试时改成电脑局域网地址，例如 `http://192.168.1.4:3000`（以电脑当前局域网 IPv4 为准）。
- 小程序上传接口：`POST /api/v1/media`（multipart，字段名 `file`），发布时传 `mediaIds`。
- 当前图片审核（`mediaCheckAsync`/OCR）还未接，先保证上传、存储、展示和后台可见；这是正式上线的 P0 阻断项之一。

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

## 账号与登录

- 本地演示：`ALLOW_DEMO_LOGIN=true` 时允许固定用户登录；生产必须设为 `false`。
- 生产微信登录：配置 `WX_APPID/WX_SECRET`，并设置 `ALLOW_DEMO_LOGIN=false`，API 会调用微信 `code2Session`。
- 管理员账号：不在前端展示，由 `.env` 的 `ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_TOTP_SECRET` 配置；启动时会同步一条 `admin_users` 记录（密码 scrypt 哈希），管理员登录仍以 env 为权威。
- 管理后台已接真实 API：审核队列读取 `/api/v1/admin/moderation/queue`，审核决策写回 API，并写 `audit_logs`。审核队列 1 秒、概览/举报 2 秒、其余页面 3-4 秒静默轮询；单飞、页面隐藏暂停、失败退避，发布后无需手动刷新。举报页展示内容和 AI 初筛详情，AI 自动驳回/通过，图片举报转人工复核。
- 管理员 TOTP：`ADMIN_TOTP_SECRET` 必须是 Base32（A-Z2-7）；用 Authenticator 扫描 `otpauth://totp/Campus:admin@campus.local?secret=<secret>&issuer=Campus`。本地临时可用 `ADMIN_TOTP=123456` 并清空 secret。
- 邀请码：客户端只接受管理后台发放的邀请码，旧的本地默认 `CAMPUS` 会在启动时自动吊销；MySQL `invite_codes` 已接入次数/过期/吊销校验，后台“邀请码”页可创建/吊销并实时显示已用次数，API 为 `GET/POST /api/v1/admin/invite-codes` 与 `POST /api/v1/admin/invite-codes/:id/revoke`。学校审核人表 `school_reviewers` 仍为多校运营预留，当前单校后台未开放；官方账号授权文件/学校初审/平台复核仍未完整接入，属于上线阻断项，详见生产清单。
- 生产环境必须接入真实微信 `code2Session`、HTTPS、TOTP、MySQL、Redis、COS 与 DeepSeek。

## 已实现

- 小程序：首页（最新/热门/精选）、紧急通知、官方通知、详情、评论/回复、发布、认证、我的、通知、举报、申诉、设置、社区公约；“我的”支持朋友圈式发布列表、相关评论会话和即时取消收藏。
- API：登录、邀请码、feed、帖子、评论、点赞/收藏、阅读、通知、举报、`/me/posts`、`/me/favorites`、`/me/comment-threads`、后台审核/通知/热度配置
- 管理后台：概览、审核队列、官方账号、通知、举报、热度配置、邀请码、审计日志
- 设计：纸张感、朱砂红、宋体标题、单列信息流、底部操作条

## 说明

- **数据模式**：`DATA_MODE=mysql`（推荐，24 张规范化业务表，自动建表并把旧 `app_state` 快照迁移到 user/post/comment/media 等表）、`file`（本地快照，重启不丢）、`memory`（纯内存，重启回种子）。MySQL 连接失败时回退本地文件；生产不要依赖回退。
- 旧 `app_state` 快照仍保留作迁移源/回滚参考，运行时不再以它为主。管理员账号、审计日志、通知槽位、邀请码已写入 `admin_users`/`audit_logs`/`notice_slot`/`invite_codes`；`school_reviewers` 为多校版预留。
- 自测脚本（先启动 API，workdir `apps/api`）：`node scripts/db-counts.mjs`；核心三阶段 `node scripts/e2e-mysql.mjs create` → 重启 API → `verify-delete` → 重启 → `check-clean`；后台三阶段 `node scripts/e2e-admin.mjs create/verify/check-clean`；邀请码两阶段 `node scripts/e2e-invite.mjs create` → 重启 → `node scripts/e2e-invite.mjs verify-clean`。
- AI 审核默认走本地规则；在 `apps/api/.env` 或根目录 `.env` 设置 `DEEPSEEK_API_KEY` 后可接 DeepSeek，失败自动降级为规则审核。举报会结合“举报原因 + 内容”做 AI 复核：明显不符自动驳回，明确色情/血腥/暴力/诈骗等或证据充分自动通过并隐藏内容，图片和证据不足转人工；后台可查看完整目标与 AI 依据。`.env` 已被 gitignore，**不要提交密钥**；如果 Key 曾在聊天/截图里出现，建议到控制台轮换。
- 微信文本内容安全：设置 `WX_APPID`、`WX_SECRET` 后 API 会调 `msgSecCheck`；测试号/未配置时自动跳过。
- 小程序图片和图标是本地生成的占位视觉，上线前替换为真实校园照片与学校授权素材。
- 四份源文档在仓库根目录，代码以文档为准；如文档与实现冲突，先改文档再改代码。
