# 校园日常分享小程序（单校版）

一个只记录“这一所学校今天发生的小事”的微信小程序。当前仓库是按四份产品/业务/开发/排版文档落地的 P0 实现。

## 目录

```text
apps/
  api/          NestJS API（本地默认内存数据，生产接 MySQL/Redis）
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
- `PUBLIC_BASE_URL`：本地默认 `http://127.0.0.1:3000`；用手机真机调试时改成电脑局域网地址，例如 `http://192.168.1.6:3000`。
- 小程序上传接口：`POST /api/v1/media`（multipart，字段名 `file`），发布时传 `mediaIds`。
- 当前图片审核（`mediaCheckAsync`/OCR）还未接，先保证上传、存储、展示和后台可见。

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

访问 `http://服务器IP/` 进入管理后台，`/api/v1/...` 为 API。当前 API 仍是内存模式；生产 MySQL/Redis 适配完成前，不要把它当正式环境。

## 账号与登录

- 本地演示：`ALLOW_DEMO_LOGIN=true` 时允许固定用户登录；生产必须设为 `false`。
- 生产微信登录：配置 `WX_APPID/WX_SECRET`，并设置 `ALLOW_DEMO_LOGIN=false`，API 会调用微信 `code2Session`。
- 管理员账号：不在前端展示，由 `.env` 的 `ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_TOTP` 配置；生产必须替换默认值。
- 管理后台已接真实 API：审核队列读取 `/api/v1/admin/moderation/queue`，审核决策写回 API。
- 邀请码：本地默认 `CAMPUS`；生产应改为服务端可撤销的邀请码。
- 生产环境必须接入真实微信 `code2Session`、学校审核人、TOTP、MySQL、Redis、COS 与 DeepSeek。

## 已实现

- 小程序：首页（最新/热门/精选）、紧急通知、官方通知、详情、评论/回复、发布、认证、我的、通知、举报、申诉、设置、社区公约
- API：登录、邀请码、feed、帖子、评论、点赞/收藏、阅读、通知、举报、后台审核/通知/热度配置
- 管理后台：概览、审核队列、官方账号、通知、举报、热度配置
- 设计：纸张感、朱砂红、宋体标题、单列信息流、底部操作条

## 说明

- **数据模式**：`DATA_MODE=file`（默认本地快照，重启不丢）、`memory`（纯内存，重启回种子）、`mysql`（MySQL 快照，连接失败自动回退本地文件）。当前单实例推荐 `file` 或 `mysql`；Redis 在这个规模不是必需，多实例/限流/队列时再加。
- MySQL 快照表 `app_state` 已包含在 `database/migrations/001_init.sql`，API 会自动创建；数据量上来后再拆成业务表查询。
- AI 审核默认走本地规则；在 `apps/api/.env` 或根目录 `.env` 设置 `DEEPSEEK_API_KEY` 后可接 DeepSeek，失败自动降级为规则审核。`.env` 已被 gitignore，**不要提交密钥**；如果 Key 曾在聊天/截图里出现，建议到控制台轮换。
- 微信文本内容安全：设置 `WX_APPID`、`WX_SECRET` 后 API 会调 `msgSecCheck`；测试号/未配置时自动跳过。
- 小程序图片和图标是本地生成的占位视觉，上线前替换为真实校园照片与学校授权素材。
- 四份源文档在仓库根目录，代码以文档为准；如文档与实现冲突，先改文档再改代码。
