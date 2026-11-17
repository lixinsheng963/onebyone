# 生产上线清单 / Production Readiness

> 版本：`v0.3.0-rc.4`
>
> 更新：2026-11-16
> 目标：单校版正式部署上线。四份源文档仍是产品/业务/设计/排版的权威依据；本文件记录工程状态、外部依赖、测试证据和验收标准。

## 1. 当前结论

单校版的核心业务闭环和原上线阻断功能已经实现：小程序登录/邀请码、信息流、发布、评论/回复、点赞/收藏、通知、举报、申诉、我的页面；管理端审核/官方账号/通知/举报/热度/邀请码/审计/用户治理/申诉/团队权限；MySQL 规范化持久化、Redis、AI 文本初筛与举报复核、邀请码次数校验、账号状态、真实注销、申诉落库、单人终审、官方账号授权链、图片安全适配器、生产配置校验、部署/备份脚本和压测脚本。

**当前是 Release Candidate，不是已经完成线上部署的版本。** 代码侧 P0-01～P0-06 已完成；P0-07～P0-10 的代码/脚本/测试已完成可离线验证的部分，剩余项依赖真实域名、HTTPS 证书、正式微信 AppID、学校授权材料、图片审核服务、目标服务器和一次真实备份恢复演练。

## 2. P0 状态

| 项目 | 状态 | 证据 / 剩余工作 |
|---|---|---|
| P0-01 官方账号授权与审核链 | 已完成（代码+API+UI） | 授权文件 PDF/JPG/PNG 私有存储、学校初审、平台复核、同组织回避、到期自动降级、审计；三阶段流程已联调 |
| P0-02 学校审核人与 RBAC | 已完成 | platform/content/school 三角色；服务端权限矩阵；撤换旧 session 失效；角色导航与团队页；越权测试通过 |
| P0-03 账号状态与治理 | 已完成 | 禁言/封禁/恢复；登录、发帖、评论、点赞、收藏、举报均校验；后台用户页+审计+站内通知 |
| P0-04 账号注销 | 已完成 | `DELETE /me` 匿名化、撤销 session、清理认证字段；旧 token 失效；小程序设置页真实调用 |
| P0-05 申诉闭环 | 已完成 | `appeals` 表、用户提交/查询、后台处理、原审核人回避、恢复内容、审计与通知 |
| P0-06 审核终审 | 已完成（单人） | 所有风险等级由一名有权限审核员直接终审；审核记录写入案件时间线与审计日志；已处理案件不能重复审核 |
| P0-07 图片内容安全 | 代码完成，生产网关待接 | 可配置同步审核网关；blocked 删除文件并 400，网关异常 503；未配置保持人工 P2；真实供应商 URL/Token 待配置 |
| P0-08 生产微信登录与 HTTPS | 配置/脚本完成，线上待部署 | production 环境校验、真实 code2Session 分支、Nginx TLS 模板、systemd、环境样例、部署文档；生产安装器强制域名/证书/微信 AppID，`ALLOW_DEMO_LOGIN=false`，启动前预检与 `/readyz` 验收；待真实域名/证书/AppID/服务器 |
| P0-09 并发与瞬时压力 | 已完成离线压测 | 250/500/1000 请求、50/100 并发均 0 错误；见第 4 节；生产需在目标服务器复测 |
| P0-10 备份、监控与 Runbook | 已完成本地恢复演练 | MySQL 备份/恢复/healthcheck/preflight 脚本、部署文档；本地 341,631 字节备份恢复后 users/posts/comments 计数一致（5/17/11）；`/readyz` 检查 MySQL/Redis；目标服务器监控告警待接 |

## 3. 外部依赖/上线前必须准备

- 已备案域名、有效 HTTPS 证书、微信小程序合法 request 域名；
- 正式小程序 AppID/Secret（测试号不能上线），并在微信后台配置服务器域名；
- 目标服务器（阿里云/腾讯云）SSH 或由运维执行部署脚本；
- COS 桶、最小权限子账号、CDN（可选）；生产建议私有桶 + 签名 URL；
- DeepSeek API Key（可选；失败回退规则审核）；
- 学校授权文件（盖章 PDF/扫描件）与学校审核人书面指定材料；
- 图片内容安全服务地址/Token（微信 `mediaCheckAsync` 或等价网关）；
- 正式管理员密码、TOTP secret、`SESSION_PEPPER`、邀请码策略；
- 备份保留周期、监控告警接收人、回滚负责人。

## 4. 验证证据（2026-11-16）

| 项目 | 命令/方式 | 结果 |
|---|---|---|
| API 构建 | `pnpm --filter @campus/api build` | 通过 |
| 管理端构建 | `pnpm --filter @campus/admin build` | 1636 modules，通过 |
| WXML/JS | `node tools/check-wxml.mjs` + `node --check` | 16 文件、全部 JS 通过 |
| MySQL e2e | `e2e-mysql.mjs create/verify-delete/check-clean` | 三阶段通过 |
| 管理端 e2e | `e2e-admin.mjs create/verify/check-clean` | 三阶段通过 |
| 邀请码 e2e | `e2e-invite.mjs create/verify-clean` | 两阶段通过 |
| 安全 smoke | `node tools/security-smoke.mjs` | 17 项通过 |
| 管理端页面 | Playwright 11 个导航、30 轮快速切换 | 无空白/console/pageerror |
| 压测 | `tools/load-test.mjs` 250/50、500/100、1000/100 | 全部 200，0 错误；1000/100 rps≈1970，p95≈78ms，p99≈91ms |
| 备份恢复 | `mysqldump` → 临时库恢复 → 计数核对 | 341,631 字节；25 张表；users/posts/comments 5/17/11 一致 |
| 生产模式 | 隔离 3099 + production 环境变量 | 启动成功、MySQL normalized、Redis connected、health 200 |
| 生产校验拒绝 | 缺失生产变量时启动 | 按预期 exit 1 并列出缺失项 |
| 生产预检 | `deploy/scripts/preflight-production.sh` 对本地开发 env | 正确拒绝并列出缺失项 |
| 就绪检查 | `GET /readyz` MySQL/Redis 正常；Redis 断开 | 200；503 |

说明：压测在独立 3001 实例、`RATE_LIMIT_MAX=10000` 下执行，避免测试流量触发生产限流；生产默认仍为 300/min。

## 5. 上线 Runbook（摘要）

1. 准备域名/证书/正式微信参数；在服务器安装 Node 20、pnpm、MySQL 8、Redis、Nginx。
2. 按 `deploy/env.production.example` 生成 `.env`，填写真实密钥；`NODE_ENV=production`、`ALLOW_DEMO_LOGIN=false`。
3. 构建 API/管理端；执行 `deploy/scripts/preflight-production.sh`；用 `deploy/systemd/campus-api.service` 启动 API。
4. 配置 `deploy/nginx/production.conf`，启用 HTTPS/HSTS/CSP/上传大小限制；只暴露 443。
5. 运行 `deploy/scripts/healthcheck.sh`（同时检查 `/healthz` 与 `/readyz`）；在微信后台配置合法域名；真机验收登录、邀请码、发布、评论、图片、审核、通知、注销、申诉。
6. 执行 `deploy/scripts/backup-mysql.sh`，再用 `restore-mysql.sh` 在隔离库完成一次恢复演练。
7. 跑 `tools/load-test.mjs` 和 `tools/security-smoke.mjs`；监控 5xx/429/登录失败/队列积压/磁盘/DB 连接。
8. 切换流量；保留上一版本与数据库备份；异常按 `docs/DEPLOYMENT.md` 回滚。

## 6. 完成定义（DoD）

- P0-01～P0-06 代码、迁移、权限、审计、自动化测试全部通过；P0-07～P0-10 的生产依赖完成配置并验证；
- 原有 e2e/安全/构建全部保持通过；
- 目标服务器完成一次从空库部署、重启、备份恢复演练；
- 真机完成登录、邀请码、发布、评论、举报、审核、通知、注销、申诉验收；
- 已知残余风险在 `SECURITY.md` 记录，并由上线负责人明确接受。
