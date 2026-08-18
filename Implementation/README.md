# ResearchOS AI - 实现方案总索引

> 本文件夹是 `IMPLEMENTATION.md` 的拆分重组，按服务/关注点切分为多个子文档，便于在对应服务目录工作时就近查阅。
>
> 定位：**面向单一开发者的 8–12 周 MVP**，技术栈 Next.js + Spring Boot + Python FastAPI。
>
> **融合现状（2026-08-18）**：本文件夹各文档描述 **legacy 三服务架构**（融合前路线）。融合后的现状以根 [`plan.md`](../plan.md)（融合方案）+ [`dsh-plugins/README.md`](../dsh-plugins/README.md)（bundle 实现/验证记录）为权威，各子文档均已增补「融合现状」小节。

## 文档清单

| 文档 | 内容 | 适用场景 |
| --- | --- | --- |
| [00-overview.md](./00-overview.md) | 仓库结构、技术栈、Feature->模块映射、服务边界 | 全局了解、任务归属判断 |
| [10-frontend.md](./10-frontend.md) | Next.js 目录结构、关键约定、API 客户端示例 | frontend 开发 |
| [20-backend.md](./20-backend.md) | Spring Boot 目录结构、分层约定、统一响应、SSE 转发、MQ 下发 | backend 开发 |
| [30-ai-service.md](./30-ai-service.md) | FastAPI 目录结构、路由、内部鉴权、Agent、RAG、worker | ai-service 开发 |
| [40-database.md](./40-database.md) | 双库 schema（MySQL 业务表 + PG 向量）、迁移脚本 | DB 改动、迁移脚本 |
| [50-api-contracts.md](./50-api-contracts.md) | 前后端 API 契约、backend<->ai-service 契约 | 接口联调 |
| [60-dataflows.md](./60-dataflows.md) | 上传分析/Chat/Review 三条核心链路时序图 | 端到端联调、排障 |
| [70-async-mq.md](./70-async-mq.md) | RabbitMQ 拓扑、消息格式、重试与 DLQ | 异步任务开发 |
| [80-security.md](./80-security.md) | JWT、多租户隔离、文件安全、内部鉴权 | 认证/权限/文件模块 |
| [90-config-deploy.md](./90-config-deploy.md) | 环境变量、application.yml、docker-compose、启动顺序 | 本地/云部署 |
| [95-testing.md](./95-testing.md) | 三服务测试策略、LLM mock、fixture | 写测试 |
| [99-milestones.md](./99-milestones.md) | Sprint 1-3 任务拆解 | 排期、进度跟踪 |
| **融合现状（2026-08-18）** | 本文件夹描述 legacy 三服务架构；融合后现状以根 [plan.md](../plan.md) + [dsh-plugins/README.md](../dsh-plugins/README.md) 为权威；各子文档均已增补「融合现状」小节 | 融合开发（DSH bundle / MCP / 网关 / UI 包） |

## 阅读顺序建议

- **新人入门**：00 -> 对应服务文档 -> 50 -> 60
- **改某个接口**：50（契约）-> 20/30（实现）-> 95（测试）
- **联调排障**：60（数据流）-> 70（MQ）-> 50（契约）
- **本地起服务**：90
- **融合开发**：plan.md（融合方案）-> dsh-plugins/README.md（bundle 实现/验证记录）-> 对应子文档的「融合现状」小节

## 与其他规范的关系

- `plan.md`：产品规划（做什么），本文档是它的实现落地（怎么做）。
  - 融合现状（2026-08-18）：`plan.md` 已改为**融合方案**（旧产品路线图保留在 git 历史），融合实现记录见 `dsh-plugins/README.md`。
- `../CLAUDE.md`：编码规范（怎么写才合规），适用于所有服务。
- `../AGENTS.md`：多 agent/多服务协作规范，契约争议以本文档夹为准。
- 各服务目录下的 `AGENTS.md`：该服务专属的模块约束。
