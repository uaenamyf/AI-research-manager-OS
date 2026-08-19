# 99 - 里程碑任务拆解

一个开发者预计 **8–12 周**完成 MVP。

> 状态更新（2026-08-15）：Sprint 1-3 全部任务已实现，✅ 表示已验证落地。
> 仅 Google OAuth（1.4）需在 Google Cloud Console 配置真实凭据后联调验证。

## 融合现状（2026-08-18）

> 本文档 Sprint 1-3 为 **legacy 原路线**（Next.js + Spring Boot + FastAPI）的任务拆解，全部任务已完成；其中旧 Next.js 前端已于 2026-08-19 移除（删 `frontend/`，无回退）。融合后的里程碑以根 `plan.md`（融合方案）+ `dsh-plugins/README.md`（bundle 实现记录，含各 Phase 验证）为权威，进度如下：

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 能力验证：最小 bundle（research-hello 可拔插闭环）/ 文献 MCP / 网关 spike / 数据层 spike（mysql2/pg 直连） | ✅ 已验证 |
| Phase 1 | 统一 LLM 网关（research-llm-gateway，OpenAI 兼容直连代理） | ✅ ResearchOS AI 已正式切到网关（chat ark-code-latest / embedding doubao-embedding-vision 2048 维） |
| Phase 2 | 文献 MCP 端到端（research-mcp：literature_search/get/cite/vector_search） | ✅ DSH agent「检索→读取→引用」全链路已验 |
| Phase 3 | 后端 bundle 11 个（auth/project/folder/paper/file/writing/review/paper-card/export/settings/subscription） | ✅ 全部完成 + 可拔插回归已验（卸载 research-folder 后其余正常） |
| Phase 4 | 前端 UI 11 包（ui-research-hello 探针 + 10 业务节点）+ Next.js 移除 | ✅ 11 包注入 boot（49 条目）；旧 Next.js :3000 已于 2026-08-19 移除 |
| Phase 5 | 数据迁移与收尾 | 🟡 进行中：数据核对 ✅（MySQL/PG 最终一致、孤儿 chunk 已清理、向量 2048 维对齐）；AI 管道迁入 DSH / MQ 下线 / 可拔插全量回归 / 文档更新 / 合入 main 待办 |

> Phase 5 待办：① AI 管道迁入 DSH（PDF 解析 + embedding + RAG + LLM 迁为 bundle / ctx.jobs，状态回调改 bundle 直写 MySQL）后才可下线 RabbitMQ（q.paper.analyze / q.review.generate / q.paper.cleanup 仍被 ai-service 消费）；② Redis 未使用（0 key）可移除；③ 可拔插全量回归（卸载全部 research-* → DSH 裸跑正常 → 重装恢复，需重启 GUI，待用户择时）；④ `Implementation/` 文档更新（本文档即本次更新的一部分）；⑤ `feat/dsh-integration` 合入 `main`（PR）。

## Sprint 1（2 周）基础平台

| # | 任务 | 服务 | 状态 |
| --- | --- | --- | --- |
| 1.1 | 仓库初始化 + docker-compose 跑通 | infra | ✅ |
| 1.2 | MySQL 业务表建表 + PG pgvector 扩展 | backend | ✅ |
| 1.3 | Spring Security + JWT 注册登录 | backend | ✅ |
| 1.4 | Google OAuth 登录 | backend | ✅ 代码完成（OAuth2ClientConfig + 登录/注册页按钮），待配置真实凭据联调 |
| 1.5 | Project CRUD | backend | ✅ |
| 1.6 | 前端登录/注册页 + dashboard 骨架 | frontend | ✅ |
| 1.7 | S3/R2 上传 + signed URL | backend | ✅（local 模式经 backend 下载） |

## Sprint 2（3 周）AI 核心能力

| # | 任务 | 服务 | 状态 |
| --- | --- | --- | --- |
| 2.1 | FastAPI 骨架 + 健康检查 + 内部鉴权 | ai-service | ✅ |
| 2.2 | RabbitMQ 消费者 + 任务回调 | ai-service | ✅ |
| 2.3 | PDF 解析 + section 切分 | ai-service | ✅ |
| 2.4 | embedding + pgvector 存储 | ai-service | ✅ |
| 2.5 | paper_agent 生成 Paper Card | ai-service | ✅ |
| 2.6 | 上传 -> 分析异步链路联调 | 全栈 | ✅ |
| 2.7 | 前端 Paper Workspace（PDF + Card） | frontend | ✅ |
| 2.8 | Paper Chat SSE 链路 | 全栈 | ✅（已实现，功能后续已移除） |
| 2.9 | RAG 检索 + prompt | ai-service | ✅ |

## Sprint 3（3 周）商业化能力

| # | 任务 | 服务 | 状态 |
| --- | --- | --- | --- |
| 3.1 | review_agent 综述生成 | ai-service | ✅ |
| 3.2 | Knowledge Base（tag + 搜索） | backend | ✅（已实现；功能后续已移除） |
| 3.3 | 前端 Review Generator 页面 | frontend | ✅（Writing Studio：Literature Review + Writing Assistant） |
| 3.4 | Stripe 订阅 + 额度拦截 | backend | ✅ |
| 3.5 | 免费档位限制（10 papers/month） | backend | ✅ PLAN_LIMITS + 上传时 checkQuota 拦截 |
| 3.6 | Dashboard 优化（统计卡片） | frontend | ✅ |
| 3.7 | E2E 测试 + 部署脚本 | 全栈 | ✅（auth 流程进 CI；upload 链路本地全栈验证） |
