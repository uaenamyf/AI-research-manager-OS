# 00 - 总览：仓库结构与技术栈

## 仓库结构（monorepo）

```
ai-research-os/
├── frontend/                 # Next.js 16 应用（融合后已下线 :3000，可 start frontend 回退）
├── backend/                  # Spring Boot 3 (Java 21)（双认证过渡期仍运行，未下线）
├── ai-service/               # FastAPI Python 服务（MQ 管道过渡期仍运行，未下线）
├── dsh-plugins/              # ★ DSH 融合插件包：12 个 research-* bundle + research-mcp（stdio MCP server）+ 11 个 ui-research-* UI 包 + scripts/dsh-gateway.sh（实现/验证记录见 dsh-plugins/README.md）
├── infra/                    # docker-compose、部署脚本
│   └── docker-compose.yml
├── docs/                     # 架构文档、API 文档
├── Implementation/           # 本文件夹（实现方案，按服务拆分；描述 legacy 三服务架构）
├── plan.md                   # 融合方案（权威；旧产品路线图保留在 git 历史）
├── CLAUDE.md                 # 项目编码规范
├── AGENTS.md                 # 多 agent 协作规范
└── README.md
```

## 服务职责边界（严格遵守）

| 服务 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| frontend | UI 渲染、状态管理、调用 backend API | 直接访问数据库、直接调用 ai-service |
| backend | 业务逻辑、用户/权限/订阅、文件上传编排、任务下发 | 实现 AI/LLM 逻辑、向量计算 |
| ai-service | PDF 解析、LLM 调用、RAG、Agent 工作流 | 持久化业务数据（结果回传 backend） |

> **铁律**：frontend 只与 backend 通信；backend 通过 RabbitMQ/HTTP 与 ai-service 通信；frontend 永远不直连 ai-service。

> **融合现状（2026-08-18）**：上表为 legacy 三服务职责边界（仍适用于在跑的 backend / ai-service 与 frontend 回退场景）。融合后职责已迁移到 DSH 单实例（驻 127.0.0.1:3080，`dsh-plugins/scripts/dsh-gateway.sh` 启动，自动注入 `.env` 的 LLM key/模型 + JWT_SECRET + MySQL/RabbitMQ/Stripe env + RESEARCH_GATEWAY_URL=http://127.0.0.1:3080）：
>
> | 职责面 | 融合后承担者 | 状态 |
> | --- | --- | --- |
> | 前端 | DSH GUI（11 个 `ui-research-*` UI 包经 `/plugins/<id>/client.js` 注入浏览器，out-of-tree 免重建 web app，boot 清单 49 条目） | ✅ Next.js（:3000）已下线，可回退 |
> | 业务后端 | `research-*` bundle（12 个，直连 MySQL，经 `ctx.webServer` 暴露 `/research-*` 路由，响应沿用 `{code,message,data}` 契约） | 🟡 Spring Boot（:8080）双认证过渡中（共享 JWT_SECRET HS256，token 双向互通），未下线 |
> | AI 能力 | DSH bundle（llm-gateway / writing / review / paper-card）+ ai-service（FastAPI :8000） | 🟡 MQ 管道过渡中（exchange researchos.ai.task，队列 q.paper.analyze / q.review.generate / q.paper.cleanup），RabbitMQ 保留至 AI 管道迁入 DSH |
> | LLM / Embedding | 统一 LLM 网关 `research-llm-gateway`（同驻 DSH 3080） | ✅ OpenAI 兼容直连代理：`POST /v1/chat/completions` + `/v1/embeddings`；上游 RESEARCH_LLM_UPSTREAM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3，chat 模型 ark-code-latest、embedding doubao-embedding-vision（2048 维） |
> | 文献暴露 | `research-mcp`（stdio MCP server，经 dsh-mcp-client 注册进 ctx.tools） | ✅ literature_search / literature_get / literature_cite / vector_search |

## 技术栈与版本锁定

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 前端 | Next.js + React | 16.x |
| 前端语言 | TypeScript | 5.x |
| UI | Tailwind CSS + shadcn/ui | latest |
| 后端 | Spring Boot | 3.3.x |
| 后端语言 | Java | 21 LTS |
| ORM | MyBatis-Plus | 3.5.x |
| 安全 | Spring Security + JWT | 6.x |
| 数据库（业务） | MySQL | 8.x |
| 向量库（AI） | PostgreSQL + pgvector 扩展 | 16 / 0.7.x |
| 缓存 | Redis | 7.x |
| 消息队列 | RabbitMQ | 3.13 |
| AI 服务 | Python + FastAPI | 3.12 / 0.115 |
| Agent | LangGraph | 0.2.x |
| RAG | LlamaIndex | 0.11.x |
| PDF 解析 | PyMuPDF + GROBID（可选） | latest |
| LLM SDK | OpenAI SDK / Anthropic SDK | latest |
| 对象存储 | AWS S3 SDK v2 / Cloudflare R2 | - |
| DSH 宿主 | DeepSeek Harness（Cordis 插件树，profile: web） | developer preview（deepseek-harness-master/） |
| DSH 插件 | Cordis bundle（dsh.bundle）+ out-of-tree 客户端 UI 包（dsh.client） | 12 个 research-* bundle + 11 个 ui-research-* 包（见 dsh-plugins/README.md） |
| MCP | MCP SDK（dsh-mcp-client + stdio server） | research-mcp/server.js |
| TS 数据库驱动 | mysql2 / pg（bundle 直连 MySQL / PG） | latest |

> 注（融合现状 2026-08-18）：Redis 未使用（0 key、无引用）可移除；RabbitMQ 保留至 AI 管道迁入 DSH 后下线。

## Feature -> 模块映射

| Feature | 前端模块 | 后端模块 | ai-service 模块 |
| --- | --- | --- | --- |
| F1 用户账户 | `app/(auth)` | `user`、`auth` | - |
| F2 Project | `app/library` | `project` | - |
| F3 论文上传 | `app/library` | `paper`、`file` | `parser/pdf_parser.py` |
| F4 Paper Card | `app/papers/[id]` | `paper` | `agents/paper_agent.py` |
| F7 Review Assistant | `app/writing` | `ai-task` | `agents/review_agent.py` |
