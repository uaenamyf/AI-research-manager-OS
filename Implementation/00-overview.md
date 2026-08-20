# 00 - 总览：仓库结构与技术栈

## 仓库结构（monorepo）

```
ai-research-os/
├── deepseek-harness-master/packages/researchos/   # ★ DSH 融合包：12 个 research-* bundle + research-ai-worker + research-mcp（stdio MCP server）+ 11 个 ui-research-* UI 包（实现/验证记录见 packages/researchos/ 各子目录）
├── scripts/                  # dsh-gateway.sh（DSH 单实例启停，注入 .env）
├── Implementation/           # 本文件夹（实现方案，按服务拆分；描述 legacy 服务架构，backend/ai-service 已于 2026-08-19 移除）
├── plan.md                   # 融合方案（权威；旧产品路线图保留在 git 历史）
├── CLAUDE.md                 # 项目编码规范
├── AGENTS.md                 # 多 agent 协作规范
└── README.md
```

## 服务职责边界（严格遵守）

| 服务 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| research-* bundle | 业务逻辑、用户/权限/订阅、文件编排、任务下发（经 lib/db.js 访问 SQLite） | 实现 AI/LLM 逻辑、向量计算 |
| research-ai-worker | PDF 解析、LLM 调用、RAG、Agent 工作流（inline 直调） | 持久化业务数据（归属 research-* bundle） |

> **铁律**：UI 客户端包只与 research-* bundle 通信（`/research-*` 路由）；AI 能力归属
> research-ai-worker 与 research-llm-gateway；客户端永远不直连数据库。

> **融合现状（2026-08-22）**：legacy backend / ai-service 已移除（AI 管道迁入 DSH
> `research-ai-worker`，`RESEARCH_AI_INLINE=1` inline 直调无 MQ）；**数据库全 SQLite 化**
> （`node:sqlite` 单文件 `~/.researchos/data/researchos.db`，零外部数据库，clone 即用）。
> 融合后职责全部在 DSH 单实例（驻 127.0.0.1:3080，`scripts/dsh-gateway.sh` 启动，自动注入
> `.env` 的 LLM key/模型 + JWT_SECRET + Stripe env + RESEARCH_GATEWAY_URL=http://127.0.0.1:3080）：
>
> | 职责面 | 融合后承担者 | 状态 |
> | --- | --- | --- |
> | 前端 | DSH GUI（11 个 `ui-research-*` UI 包经 `/plugins/<id>/client.js` 注入浏览器，boot 清单 49 条目） | ✅ 旧 Next.js（:3000）已移除（2026-08-19） |
> | 业务后端 | `research-*` bundle（12 个，经 `ctx.webServer` 暴露 `/research-*` 路由，响应沿用 `{code,message,data}` 契约；数据存取走 `lib/db.js` SQLite 抽象层） | ✅ Spring Boot（:8080）已移除（2026-08-19，JWT 由 research-auth 自持，共享 `JWT_SECRET`） |
> | 数据层 | **SQLite 单文件**（`lib/db.js`：8 业务表 + `paper_chunk` 向量 BLOB，JS 余弦检索） | ✅ MySQL/PG 已替换（2026-08-22）；迁移脚本已随 infra 删除（git 历史可查） |
> | AI 能力 | research-ai-worker（解析/嵌入/卡片/综述/写作，inline）+ research-llm-gateway | ✅ FastAPI（:8000）与 RabbitMQ 已移除（2026-08-19） |
> | LLM / Embedding | 统一 LLM 网关 `research-llm-gateway`（同驻 DSH 3080） | ✅ OpenAI 兼容直连代理：`POST /v1/chat/completions` + `/v1/embeddings`；上游 RESEARCH_LLM_UPSTREAM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3，chat 模型 ark-code-latest、embedding doubao-embedding-vision（2048 维） |
> | 文献暴露 | `research-mcp`（stdio MCP server，经 dsh-mcp-client 注册进 ctx.tools） | ✅ literature_search / literature_get / literature_cite / vector_search |

## 技术栈与版本锁定

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 前端 | DeepSeek Harness GUI（ui-research-* 客户端包，TypeScript） | DSH 0.1.0-rc.x |
| 应用层 | DSH 融合包（Cordis bundle + out-of-tree 客户端 UI 包） | 12 个 research-* bundle + research-ai-worker + 11 个 ui-research-* 包（见 deepseek-harness-master/packages/researchos/） |
| 数据库 | **SQLite（node:sqlite 内置，零依赖）** | Node 22.5+（建议 24+） |
| 向量检索 | `paper_chunk.embedding` BLOB（Float32Array）+ JS 余弦相似度 | 默认 2048 维（EMBEDDING_DIM） |
| AI 管道 | research-ai-worker（Node.js，inline 直调，无 MQ） | packages/researchos/ai-worker |
| LLM / Embedding | 统一 LLM 网关 research-llm-gateway（OpenAI 兼容直连代理） | packages/researchos/llm-gateway |
| MCP | MCP SDK（dsh-mcp-client + stdio server） | packages/researchos/mcp/server.js |
| 数据抽象 | `lib/db.js`（mysql2 兼容 `createPool()` + 向量工具） | packages/researchos/lib/db.js |

> 注（融合现状 2026-08-22）：MySQL / PostgreSQL / Redis / RabbitMQ / backend / ai-service
> 均已下线；legacy 技术栈行（Spring Boot / FastAPI / mysql2 / pg 等）见 git 历史。

## Feature -> 模块映射

| Feature | 前端模块 | 后端模块 | ai-service 模块 |
| --- | --- | --- | --- |
| F1 用户账户 | `app/(auth)` | `user`、`auth` | - |
| F2 Project | `app/library` | `project` | - |
| F3 论文上传 | `app/library` | `paper`、`file` | `parser/pdf_parser.py` |
| F4 Paper Card | `app/papers/[id]` | `paper` | `agents/paper_agent.py` |
| F7 Review Assistant | `app/writing` | `ai-task` | `agents/review_agent.py` |
