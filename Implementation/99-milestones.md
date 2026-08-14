# 99 - 里程碑任务拆解

一个开发者预计 **8–12 周**完成 MVP。

## Sprint 1（2 周）基础平台

| # | 任务 | 服务 |
| --- | --- | --- |
| 1.1 | 仓库初始化 + docker-compose 跑通 | infra |
| 1.2 | MySQL 业务表建表 + PG pgvector 扩展 | backend |
| 1.3 | Spring Security + JWT 注册登录 | backend |
| 1.4 | Google OAuth 登录 | backend |
| 1.5 | Project CRUD | backend |
| 1.6 | 前端登录/注册页 + dashboard 骨架 | frontend |
| 1.7 | S3/R2 上传 + signed URL | backend |

## Sprint 2（3 周）AI 核心能力

| # | 任务 | 服务 |
| --- | --- | --- |
| 2.1 | FastAPI 骨架 + 健康检查 + 内部鉴权 | ai-service |
| 2.2 | RabbitMQ 消费者 + 任务回调 | ai-service |
| 2.3 | PDF 解析 + section 切分 | ai-service |
| 2.4 | embedding + pgvector 存储 | ai-service |
| 2.5 | paper_agent 生成 Paper Card | ai-service |
| 2.6 | 上传 -> 分析异步链路联调 | 全栈 |
| 2.7 | 前端 Paper Workspace（PDF + Card） | frontend |
| 2.8 | Paper Chat SSE 链路 | 全栈 |
| 2.9 | RAG 检索 + prompt | ai-service |

## Sprint 3（3 周）商业化能力

| # | 任务 | 服务 |
| --- | --- | --- |
| 3.1 | review_agent 综述生成 | ai-service |
| 3.2 | Knowledge Base（tag + 搜索） | backend |
| 3.3 | 前端 Review Generator 页面 | frontend |
| 3.4 | Stripe 订阅 + 额度拦截 | backend |
| 3.5 | 免费档位限制（10 papers/month） | backend | ✅ PLAN_LIMITS + 上传时 checkQuota 拦截 |
| 3.6 | Dashboard 优化（统计卡片） | frontend |
| 3.7 | E2E 测试 + 部署脚本 | 全栈 | ✅ |
