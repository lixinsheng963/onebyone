# 安全基线 / Security Baseline

本项目是单校小程序 + API + 管理后台。以下内容是当前代码的安全基线，以及上线前必须完成的事项。

## 已实施的控制

- 管理后台账号不再写死在前端或源码：由 `ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_TOTP`（或 `ADMIN_TOTP_SECRET`）提供。
- 管理后台登录失败 5 次锁定 15 分钟；用户登录也有频率限制。
- 管理员 session 默认 12 小时，用户 session 默认 30 天；支持 logout 撤销。
- 生产环境默认要求微信 `code2Session`；`ALLOW_DEMO_LOGIN=true` 只用于本地演示。
- CORS 使用 `CORS_ORIGINS` 白名单，不再反射任意 Origin，且不携带 credentials。
- Fastify 全局请求限流、Helmet 安全响应头、1MB JSON 请求体上限。
- 所有写接口做长度/枚举/ID 校验；后台审核拒绝必须写理由。
- 修复越权：
  - 未发布内容只有作者能看；
  - 未发布内容不能评论/点赞/收藏/阅读；
  - 通知已读只能操作自己的通知；
  - 删除/置顶只能操作自己的内容；
  - 管理员接口统一校验 token。
- 图片上传只接受 JPG/PNG/WebP，8MB 上限，Sharp 重编码去 EXIF，限制像素数；单用户每小时最多 20 张。
- 上传文件使用随机文件名和固定目录，禁止路径穿越；静态文件加 `nosniff` 和缓存头。
- 生产 Nginx 配置增加 CSP、X-Frame-Options、Referrer-Policy、Permissions-Policy、HSTS、API 限流和请求体限制。
- 生产环境 `ALLOW_DEMO_LOGIN=false`，邀请码由 `INVITE_CODE` 配置。

## 已验证

```text
node tools/security-smoke.mjs
```

覆盖：

- 健康检查和响应头
- 恶意 Origin 被 CORS 拒绝
- 管理员接口匿名访问 401
- 未登录发布 401
- 通知越权 401
- 未登录申诉 401
- 超长正文 400
- 非法 feed 查询 400
- 静态路径穿越 404
- 伪造图片 400
- 暴力威胁 P0 扣留
- 未发布内容匿名不可读、作者可读

## 上线前必须做

1. 把所有默认密码、TOTP、邀请码换掉，不能使用仓库里的本地演示值。
2. 生产 `.env`：
   - `NODE_ENV=production`
   - `ALLOW_DEMO_LOGIN=false`
   - `ADMIN_PASSWORD` 使用至少 16 位随机密码
   - `ADMIN_TOTP_SECRET` 使用真实 TOTP secret（Google Authenticator 等）
   - `CORS_ORIGINS=https://你的后台域名`
   - `TRUST_PROXY=true`
   - `PUBLIC_BASE_URL=https://api.你的域名`
   - `SESSION_PEPPER` 使用随机长字符串
   - `REDIS_ENABLED=true`（配置了 Redis 时）
3. 配置 HTTPS，禁止明文 HTTP 管理后台；Nginx 当前只监听 80，生产必须加 TLS。
4. 管理后台不要暴露在公网无防护环境；至少加 VPN、IP 白名单或 Zero Trust。
5. MySQL 使用普通业务账号，只授权 `campus.*`，不要用 root；限制 3306 只对内网开放。
6. Redis 不暴露公网，并设置 `requirepass`；当前应用没有强依赖 Redis。
7. COS 使用子账号密钥，只授权目标桶；不要用主账号密钥。
8. 备份 `apps/api/data/store.json` 和 `apps/api/uploads`（file 模式），或改用 MySQL + COS；备份要加密并限制访问。
9. 轮换已经出现在聊天/日志里的 DeepSeek、COS、微信 secret。
10. 监控 401/403/429、上传量、磁盘、异常登录和审核队列。

## 仍然存在的风险

- session token 现在以 HMAC-SHA256 + `SESSION_PEPPER` 哈希后保存；`store.json` / MySQL 快照不再出现原始 token。客户端仍然持有 bearer token，所以 XSS/客户端泄露仍可能被盗用。
- Redis 当前用于**分布式登录限流**（`REDIS_ENABLED=true` 时）；session 仍由 file/MySQL 快照承载，Redis 不是登录态的唯一存储。
- file 模式只适合单实例；多实例必须 MySQL + Redis，且全局限流仍建议使用 Redis/网关集中实现。
- 图片 AI 视觉审核尚未接入；含图内容当前强制人工复核，不会自动发布。
- 管理后台的本地 TOTP 回退仍是静态值；生产必须设置 `ADMIN_TOTP_SECRET`，否则不要上线。
- Nginx 示例没有 TLS 证书；生产必须配置 HTTPS 和真实证书。
- 应用层全局限流仍是单进程内存限流；登录限流在 `REDIS_ENABLED=true` 时才使用 Redis。Nginx 还有一层，但多实例时需要把全局限流也迁到 Redis/网关。
- 本地 `/uploads` 是公开静态资源；敏感图片不应放入公开 feed。
- 没有第三方 WAF/抗 DDoS；公网部署建议接腾讯云 WAF/CDN。

## 安全测试命令

```powershell
# 启动 API 后
node tools/security-smoke.mjs
```

该脚本只创建一条测试内容并在结束时删除，不会修改管理员数据。
