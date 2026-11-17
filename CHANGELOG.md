# 更新记录 / Changelog

## v0.3.0-rc.4 — 2026-11-18

### 变更

- 审核流程调整为一名有权限的审核员直接终审，适用于 P0～P3 全部风险等级；不再要求第二名审核员或平台第三票。
- 管理端移除“升级复核”“等待第二位审核员”“意见冲突裁决”等入口，保留单人审核记录。
- 管理端审核成功提示改为立即生效；已处理案件仍不可重复审核。
- E2E 管理端用例改为单人终审，并验证 MySQL `moderation_cases.reviews_json` 只有一条审核记录。

### 验证

- 平台管理员对 P0 评论单人拒绝：API 返回 rejected，DB 状态 rejected，reviews_json 1 条，decided_by 有值。
- `e2e-admin` create → 重启 verify → 重启 check-clean 通过；`e2e-mysql` 三阶段通过；安全 smoke 17 项通过；API/admin 构建通过。

## v0.3.0-rc.3 — 2026-11-16

### 修复

- 修复阿里云一键部署脚本会写入 `ALLOW_DEMO_LOGIN=true`、HTTP `PUBLIC_BASE_URL`、空微信参数，导致生产 API 拒绝启动或无法真机登录的问题。
- 一键部署现在强制要求备案域名、TLS 证书、正式微信 AppID/Secret；生成 `NODE_ENV=production`、`ALLOW_DEMO_LOGIN=false`、HTTPS/CORS、`TRUST_PROXY=true`、`RATE_LIMIT_MAX=300`。
- 一键部署改为使用 HTTPS Nginx 模板，并在启动 API 前执行生产预检、启动后执行公网 `/readyz` 预检。
- Nginx 模板增加 `/readyz` 反代。

### 验证

- 安装器与预检脚本 `bash -n` 通过；生产预检对开发 `.env` 正确拒绝。
- `/readyz` 正常 200、Redis 断开 503；`security-smoke` 17 项通过。

## v0.3.0-rc.2 — 2026-11-16

### 新增

- 新增生产预检脚本 `deploy/scripts/preflight-production.sh`：检查生产环境变量、Node/MySQL/Redis/Nginx、磁盘、HTTPS 与 public `/readyz`，失败即阻止上线。
- 新增 `GET /readyz`：真实检查 MySQL 与 Redis；任一不可用返回 503，供 Nginx、systemd 和监控使用；`/healthz` 继续表示进程存活。
- `healthcheck.sh` 同时检查 `/healthz` 与 `/readyz`；部署文档补充预检和 readiness 流程。

### 验证

- `GET /readyz` 在 MySQL/Redis 正常时返回 200；Redis 不可用时返回 503。
- 生产预检对本地开发 `.env` 正确拒绝，并列出缺失的生产配置。
- `security-smoke.mjs` 17 项通过；API 构建通过。

## v0.3.0-rc.1 — 2026-11-16

### 新增

- RBAC：平台管理员/内容审核员/学校审核员三角色；服务端权限矩阵、团队权限页、撤换后旧会话失效。
- 官方账号授权链：授权文件私有存储、学校初审、平台复核、同组织回避、到期自动降级、管理员下载。
- 用户治理：禁言/封禁/恢复、后台用户页、站内通知；登录、发帖、评论、点赞、收藏、举报均校验账号状态。
- 真实注销 `DELETE /me`：匿名化资料、撤销会话、清理认证字段。
- 申诉落库：用户提交/查询、后台复核、原审核人回避、恢复内容、审计通知。
- P0/P1 双人复核：两名不同审核员一致才终审，冲突由平台管理员第三票裁决。
- 图片安全适配器：可配置审核网关；违规删除并拒绝，不可用时 503，未配置保持人工审核。
- 生产启动校验、Nginx HTTPS 模板、systemd、备份/恢复/健康检查脚本和部署 Runbook。
- 管理端用户治理/申诉/团队权限页面；11 个栏目实时轮询与错误边界。

### 修复

- 邀请码次数、吊销、名称/编号排序，客户端强制使用后台发放码。
- 管理端快速切换空白页、DeepSeek `thinking` 参数、举报/通知契约、无 body DELETE 的 Content-Type 问题。
- 点赞/收藏被禁言时的错误文案、管理端删除/日期选择器等问题。

### 验证

- API/admin 构建、WXML/JS、MySQL/admin/邀请码 e2e、安全 smoke 17 项全部通过。
- 压测 250/50、500/100、1000/100 全部 200、0 错误；1000/100 rps 约 1970，p95 约 78ms，p99 约 91ms。
- 生产模式启动校验正反向验证通过；管理端 11 导航/30 轮快速切换无空白。

### 上线前剩余（外部依赖）

- 备案域名/HTTPS、正式微信 AppID、学校授权材料、图片审核供应商、目标服务器部署与备份恢复演练、真机验收。

## v0.2.0-preproduction — 2026-11-16

### 新增

- MySQL 24 张规范化业务表、旧 `app_state` 快照迁移、会话/审计/邀请码/通知槽位持久化。
- Redis 登录限流；生产安全基线（CORS 白名单、Helmet、全局限流、上传校验、session 哈希）。
- 管理端实时轮询（1-4 秒、单飞、页面隐藏暂停、失败退避）与页面级错误边界。
- 举报 AI 复核、AI 初筛、举报目标详情、手动隐藏内容。
- 官方账号/通知/举报/热度/邀请码/审计日志管理；邀请码名称、编号升序、1-100 次、吊销、使用次数实时刷新。
- 小程序“我的”页面：朋友圈式发布列表、相关评论会话、即时取消收藏、统一统计入口、设置按钮居中。
- 小程序邀请码强制使用管理端发放码，旧默认 `CAMPUS` 自动吊销。
- 本地媒体 URL 归一化，支持真机通过局域网 IP 访问图片。
- 三阶段 MySQL/admin/邀请码 e2e、安全 smoke、WXML/JS 检查和 admin/API 构建验证。

### 修复

- 修复 `tsx` 不生成装饰器元数据导致 NestJS 注入失败。
- 修复管理端快速切换页面时 Vite HMR 旧模块导致的空白页。
- 修复举报/通知/邀请码在管理端与 API 之间的契约不一致。
- 修复 DeepSeek `thinking` 参数错误导致 AI 审核 422。
- 修复管理端删除无 body 请求被错误设置 JSON Content-Type 的问题。

### 已知上线阻断

- 官方账号授权文件/学校审核人/平台复核未完整接入。
- 用户禁言/封禁、真实注销、申诉复核未接入。
- P0/P1 双人复核未强制。
- 图片内容安全未接。
- 生产 HTTPS/域名/ICP/真实微信登录/服务器部署未验收。
- 并发压力、备份恢复、监控告警未完成。

详见 [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md)。

## v0.1.0 — 初始版本

- 导入小程序、API、管理端、四份源文档、MySQL schema、部署脚手架。
