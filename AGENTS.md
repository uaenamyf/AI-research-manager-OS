# AGENTS.md - 多服务 / 多 Agent 协作规范

> 本文件定义 ResearchOS AI 项目中**多服务开发**与**多 AI Agent 协作**的规则。
>
> 适用于：开发者、AI 编程助手（Claude Code 等）、子 agent 派发。
>
> 配套 `CLAUDE.md`（编码规范）与 `Implementation/` 文件夹（实现方案，入口见 `Implementation/README.md`）使用。
>
> 各服务目录下的 `AGENTS.md`（`frontend/AGENTS.md`、`backend/AGENTS.md`、`ai-service/AGENTS.md`）是该服务的模块级约束，开发对应服务前必读。

---

## 0. 融合现状（2026-08-18）

> ResearchOS 已融入 DeepSeek Harness（DSH）：融合方案见根 `plan.md`，bundle 实现记录见 `dsh-plugins/README.md`，开发分支 `feat/dsh-integration`（`dev` 保持原工程可运行状态，作为回退基线）。

### 0.1 当前形态

- **DSH 单实例驻 `127.0.0.1:3080`**（`dsh-plugins/scripts/dsh-gateway.sh` 启动，自动注入 `.env` 的 key / JWT / MySQL 等环境变量），单个 DSH 进程承载：
  - **统一 LLM 网关 `research-llm-gateway`**（plan.md 中称 `dsh-llm-gateway`）：OpenAI 兼容直连代理，`POST /v1/chat/completions` + `POST /v1/embeddings`；上游 key/模型单点收口（chat `ark-code-latest` / embedding `doubao-embedding-vision`，来源 `.env`）。
  - **12 个 `research-*` 业务 bundle**：auth / project / folder / paper / file / writing / review / paper-card / export / settings / subscription / llm-gateway；经 `ctx.webServer` 暴露 `/research-*` 路由，直连 MySQL（业务表）+ PG（`paper_chunk` 向量）。
  - **`research-mcp`**：stdio MCP server（`research-mcp/server.js`，由 dsh mcp-client 拉起），工具 `literature_search` / `literature_get` / `literature_cite` / `vector_search`，向 DSH agent 暴露文献检索/读取/引用/向量检索。
  - **11 个 `ui-research-*` UI 包**（hello 探针 + 10 个业务节点）：聊天节点（library / paper / citation）+ 关键词触发面板（dashboard / writing / settings / literature / review / upload / project 等），遵循 DSH `ConversationNodeDefinition` / slot / props 规范接入浏览器 GUI。
- **前端 = DSH GUI**：Next.js（:3000）已停（`docker compose --profile app stop frontend`），可随时回退（`start frontend`）。
- **backend（Spring Boot :8080）与 ai-service（FastAPI :8000）仍在运行**：处于双认证 + MQ 管道过渡期；RabbitMQ 保留至 AI 管道迁入 DSH（`q.paper.analyze` / `q.review.generate` / `q.paper.cleanup` 仍被 ai-service 消费）；Redis 未使用（0 key、无引用）可移除。

### 0.2 契约要点

- 统一响应 `{ code, message, data }`，分页 `?page=&size=`（沿用 §3）。
- **双认证**：bundle 与旧 Spring Boot 共享同一 `JWT_SECRET`（HS256，`sub/email/plan/iat/exp` + bcrypt），token 双向互通，前端切换无需重新登录。
- 内部调用带 `X-Internal-Token`（bundle ↔ backend 代理兜底等）。
- **bundle 查询强制 `user_id` 过滤**（越权 404），沿用 §3 / §10 铁律。

### 0.3 委派规则更新（§4 基础上新增）

| 任务关键词 | 委派给 |
| --- | --- |
| DSH bundle 开发/验证（research-\* 业务域、llm-gateway、research-mcp） | dsh 域 agent |

- 改动 DSH 插件（`dsh-plugins/`）必须遵循 `dsh-plugins/README.md` 的包结构规范：`package.json` 声明 `dsh.bundle`（插件）或 `dsh.client`（客户端 UI 包）、`cordis.patch.yml` 自挂载（`- insert:` 行）、`index.js` `export function apply(ctx)`（Cordis 插件形态）。
- UI 包遵循 DSH `packages/client/AGENTS.md` 的 slot / props 规范（`ConversationNodeDefinition` 等）。
- 安装/启停/卸载走 `dsh plugin --profile web add|remove`；「可拔插」（卸载不破坏其余功能）是验收项。

### 0.4 适用范围

- 本文档 §1-§10 仍适用于**仍在运行的 legacy 三服务**（backend / ai-service 开发；frontend 仅回退场景）。
- 融合相关新工作（bundle / MCP / 网关 / UI 包）以本章节 + `plan.md` + `dsh-plugins/README.md` 为准；契约变更同步更新 `Implementation/` 与 `plan.md`。

---

## 目录

1. [协作模型总览](#1-协作模型总览)
2. [三个服务及其 Agent 角色](#2-三个服务及其-agent-角色)
3. [跨服务契约（不可违反）](#3-跨服务契约不可违反)
4. [任务委派规则](#4-任务委派规则)
5. [跨服务改动流程](#5-跨服务改动流程)
6. [数据流与状态同步](#6-数据流与状态同步)
7. [错误处理与回滚](#7-错误处理与回滚)
8. [AI Agent 工作流约束](#8-ai-agent-工作流约束)
9. [开发协作约定](#9-开发协作约定)
10. [禁止事项](#10-禁止事项)

---

# 1. 协作模型总览

> ⚠️ 融合现状见 §0：前端已切换为 DSH GUI（:3080），backend / ai-service 仍在运行；本节描述的三服务架构适用于仍在运行的 legacy 服务。

本项目是 **monorepo + 三服务**架构：

```
┌─────────────┐    REST API    ┌──────────────┐   HTTP/MQ   ┌──────────────┐
│  frontend   │ ─────────────> │   backend    │ ──────────> │  ai-service  │
│  Next.js    │                │  Spring Boot │             │   FastAPI    │
│  (TS)       │ <───────────── │   (Java)     │ <────────── │  (Python)    │
└─────────────┘   统一响应/SSE  └──────────────┘  结果回调   └──────────────┘
                                      │                           │
                          ┌───────────┼───────────┐               │
                          │           │           │               │
                        MySQL     Redis       RabbitMQ       PostgreSQL
                     (业务数据)  (缓存/会话)   (异步任务)      +pgvector
                                                              (向量库)
```

**协作铁律**：服务间只通过**明确定义的契约**通信，禁止跨服务直接访问对方内部实现（数据库表、内部类、私有函数）。

---

# 2. 三个服务及其 Agent 角色

## 2.1 frontend（Next.js）

> （融合现状见 §0：Next.js :3000 已停，当前前端 = DSH GUI，可回退）

- **定位**：用户交互层，纯展示 + 状态管理。
- **开发 agent 角色**：前端工程师。
- **职责**：
  - 路由、页面、组件实现。
  - 调用 backend `/api/*` 接口。
  - 状态管理（Zustand + TanStack Query）。
- **禁止**：
  - 直连数据库。
  - 直连 ai-service（即使为了调试）。
  - 在客户端处理任何需要 LLM 密钥的逻辑。

## 2.2 backend（Spring Boot）

- **定位**：业务核心层，负责用户、权限、订阅、文件编排、任务下发。
- **开发 agent 角色**：后端工程师。
- **职责**：
  - 认证授权、多租户隔离。
  - 业务表 CRUD（user/project/paper/task/conversation）。
  - 文件上传编排（签发 S3 pre-signed URL）。
  - 异步任务下发到 RabbitMQ + 接收 ai-service 回调。
  - 同步转发 ai-service 的 SSE 流（Paper Chat）。
- **禁止**：
  - 实现 LLM 调用、向量计算、PDF 解析逻辑。
  - 在 backend 进程内做重计算（交给 ai-service）。

## 2.3 ai-service（FastAPI）

- **定位**：AI 能力层，PDF 解析、LLM、RAG、Agent 工作流。
- **开发 agent 角色**：AI 工程师。
- **职责**：
  - PDF 解析 + section 切分。
  - embedding 生成 + pgvector 写入（仅 `paper_chunk` 表）。
  - LLM 调用（paper_agent / chat_agent / review_agent / writing_agent）。
  - RabbitMQ 异步消费 + 回调 backend。
- **禁止**：
  - 写业务表（user/project/paper/ai_task/conversation）。
  - 直接对前端暴露（只接受 backend 带 `X-Internal-Token` 的调用）。
  - 持久化用户敏感信息（密钥等只在内存/环境变量）。

---

# 3. 跨服务契约（不可违反）

## 3.1 frontend -> backend

- 统一响应：`{ code: 0, message, data }`。
- 认证：httpOnly cookie 携带 JWT。
- 分页：`?page=&size=`。
- 流式：SSE（`text/event-stream`）。

## 3.2 backend -> ai-service（同步）

- HTTP + `X-Internal-Token` 头。
- 端点：`POST /rag/chat/stream`（SSE）、`POST /paper/analyze`（少用，主要用于调试）。
- ai-service 不返回业务实体，只返回 AI 结果（文本/markdown/json）。

## 3.3 backend -> ai-service（异步）

- 经 RabbitMQ exchange `researchos.ai.task`。
- 消息：`{ taskId, type, payload }`。
- ai-service 消费后，处理完成回调 backend：`PATCH /internal/paper/{id}/result` 或 `PATCH /internal/task/{id}/result`。
- 回调同样带 `X-Internal-Token`。

## 3.4 数据库访问边界

**双库架构**：业务数据在 MySQL，AI 向量在 PostgreSQL。

| 表 | 库 | backend 可读写 | ai-service 可读写 |
| --- | --- | --- | --- |
| app_user | MySQL | ✅ | ❌ |
| research_project | MySQL | ✅ | ❌ |
| folder | MySQL | ✅ | ❌ |
| paper | MySQL | ✅ | ❌（仅读元数据） |
| paper_chunk | PostgreSQL | ❌ | ✅ |
| conversation | MySQL | ✅ | ❌ |
| ai_task | MySQL | ✅ | ❌（仅通过回调间接更新 status/result） |

> ai-service 如需 paper 的 pdf_url，由 backend 在 MQ 消息 payload 中传入，不自行查库。
> `paper_chunk.paper_id` 是跨库逻辑外键（无物理约束），删除论文时 backend 发 MQ 让 ai-service 清理 PG chunk。

---

# 4. 任务委派规则

适用于**开发者派任务给 AI 助手**，或**主 agent 派子 agent**。

## 4.1 按服务域委派

任务必须明确归属服务，避免一个 PR 跨三个服务乱改：

| 任务关键词 | 委派给 |
| --- | --- |
| 页面、组件、样式、路由 | frontend agent |
| 用户、权限、API、订阅、MQ 发送 | backend agent |
| PDF 解析、LLM、RAG、agent、MQ 消费 | ai-service agent |
| docker、部署、CI | infra agent |

## 4.2 跨服务任务拆解

涉及多服务的功能（如「实现论文上传到 AI 分析全链路」）必须拆成子任务，分别派给对应 agent，**不要让一个 agent 改三个服务**：

```
[父任务] 论文上传 -> AI 分析链路
  ├─ [子任务-frontend] 上传组件 + 状态轮询 UI
  ├─ [子任务-backend] 上传 API + MQ 发送 + 回调接收
  └─ [子任务-ai-service] MQ 消费 + 解析 + paper_agent + 回调
```

## 4.3 子 agent 派发（Claude Code）

- 用 `runSubagent` 派发只读调研任务时，用 `Explore` agent。
- 派发实现任务时，prompt 必须包含：目标文件、契约约束、验收标准。
- 子 agent 默认无写权限时只做研究，需写代码时在 prompt 明确「需要修改文件」。

---

# 5. 跨服务改动流程

修改影响契约时，必须按顺序进行，**不可单边修改**：

1. **提案**：在 `docs/` 或 PR 描述中说明契约变更（新增字段/改路由/改消息格式）。
2. **先改契约文档**：更新 `Implementation/` 下对应子文档（契约争议见 `50-api-contracts.md` / `70-async-mq.md` / `80-security.md`）。
3. **同步改双方代码**：backend 与 ai-service（或 frontend 与 backend）同步修改。
4. **补测试**：契约双方都要有对应测试（backend 测调用、ai-service 测接收）。
5. **联调验证**：docker-compose 起全栈，跑通端到端流程。

**禁止**：只改一端就提交，导致另一端调用失败。

---

# 6. 数据流与状态同步

## 6.1 论文状态机（单一数据源在 backend）

```
UPLOADED -> PROCESSING -> READY
                    \-> FAILED
```

- 状态字段在 backend `paper.status`，是前端查询的唯一来源。
- ai-service 处理中不直接改 `paper.status`，而是回调 backend 由 backend 改。
- 前端轮询 `/api/papers/{id}/status` 或订阅 SSE 获取状态变化。

## 6.2 AI 任务状态机

```
PENDING -> PROCESSING -> SUCCESS
                    \-> FAILED
```

- `ai_task` 表由 backend 创建与维护。
- ai-service 通过回调间接更新，回调 payload：`{ status, result, error }`。

## 6.3 向量数据一致性

- `paper_chunk` 由 ai-service 写入，写入成功后才回调 backend 标记 `READY`。
- 若 ai-service 写向量失败，回调 `FAILED`，backend 标记 paper 失败，前端提示重试。
- 删除论文时（双库无物理外键）：backend 删 MySQL `paper` 记录，发 MQ `paper.delete` 让 ai-service 清理 PG `paper_chunk`（跨库最终一致，见 `70-async-mq.md`）。

---

# 7. 错误处理与回滚

## 7.1 同步链路（Chat）

- ai-service LLM 失败 -> 返回 5xx + 错误信息。
- backend 捕获后向前端返回友好错误（不透传内部细节）。
- 前端展示「AI 暂时不可用，请重试」。

## 7.2 异步链路（分析/综述）

- ai-service 消费失败 -> MQ 重试 3 次（指数退避）。
- 超限进 DLQ -> backend 监听 DLQ -> 标记 task `FAILED` + 记录 error。
- 用户可从前端触发「重新分析」，backend 重发 MQ。

## 7.3 部分失败

- paper_agent 成功但 embedding 失败：整体标记 `FAILED`，不保留半成品。
- review 生成到一半失败：已生成的部分 markdown 不持久化，task 标记 `FAILED`，重试时从头生成。

---

# 8. AI Agent 工作流约束

指项目内的 4 个业务 Agent（paper/chat/review/writing），不是开发协作 agent。

## 8.1 输入输出契约

每个 Agent 必须有明确输入输出 schema：

| Agent | 输入 | 输出 |
| --- | --- | --- |
| paper_agent | `{ pdf_url }` | `{ title, method, finding, limitation, future_work }` |
| chat_agent | `{ paper_id, question }` | 流式 text（SSE） |
| review_agent | `{ paper_ids, topic }` | markdown 文本 |
| writing_agent | `{ text, action }` | 改写后文本 |

## 8.2 实现约束

- **LLM 调用必须可替换 provider**：通过 `llm/client.py` 统一封装，支持 openai / anthropic 切换（环境变量 `LLM_PROVIDER`）。
- **Prompt 与代码分离**：prompt 模板放 `app/agents/prompts/` 或常量，不散落在逻辑中。
- **RAG 必须带来源**：chat_agent 回答需附引用 chunk_id，便于前端展示出处。
- **不越权**：Agent 只读 `paper_chunk` 与传入的 metadata，不查业务表。

## 8.3 guardrail 与重试（重要）

> 此约束源自 openai-agents SDK 实践经验。

- output guardrail 触发 `tripwire_triggered=True` 时，SDK **不会自动重试** LLM。
- 必须手动 `try/except` 捕获 `OutputGuardrailTripwireTriggered`，从 `e.guardrail_result.output.output_info` 取反馈，重新调用并注入反馈 prompt。
- handoff 是 LLM 驱动的动态路由，**非固定管道**。对固定流程（如 paper -> review）用手动顺序执行，不依赖 handoff。
- Mock 模式测试时，MockSDKModel 返回纯文本不触发工具调用，handoff 链需回退手动链。

---

# 9. 开发协作约定

## 9.1 分支与 PR

- `main` 保护，只通过 PR 合入。
- 分支命名：`feat/<scope>-<desc>`、`fix/<scope>-<desc>`。
- 一个 PR 尽量只改一个服务；跨服务改动拆多个 PR 但同批合。
- PR 描述必须包含：改了什么契约、是否更新 `Implementation/` 对应文档、测试情况。

## 9.2 代码审查 checklist

- [ ] 是否遵守服务边界（无越界调用）？
- [ ] service 查询是否带 `user_id`？
- [ ] Python 文件头是否符合 CLAUDE.md §3？
- [ ] 新增依赖是否更新技术栈表？
- [ ] 契约变更是否同步改了双方？
- [ ] 是否补充了测试？

## 9.3 沟通

- 契约争议以 `Implementation/` 文件夹为准；如需变更，先改文档再改代码。
- 不确定归属时，按「数据归属方决定」原则：业务数据归 backend，AI 数据归 ai-service。

---

# 10. 禁止事项

1. ❌ frontend 直连 ai-service 或数据库。
2. ❌ ai-service 写业务表（user/project/paper/task/conversation）。
3. ❌ backend 实现 LLM/向量/PDF 解析逻辑。
4. ❌ 单 PR 跨三个服务同时改（必须拆分）。
5. ❌ 只改契约一端就提交（必须同步双方）。
6. ❌ 在 ai-service 暴露 LLM API key 给前端。
7. ❌ service 查询不带 `user_id` 过滤（越权漏洞）。
8. ❌ 硬编码密钥、token、连接串入库。
9. ❌ Python 文件头出现 `# changelog`（应写在改动处上方）。
10. ❌ 用 handoff 实现固定管道（应手动顺序执行）。

---

> 本规范保证三服务解耦、契约清晰、安全可审计。任何协作冲突以本文件 + `CLAUDE.md` 为裁决依据。
