# ResearchOS × DeepSeek Harness 融合方案

> 本文件定义 ResearchOS 融入 DeepSeek Harness（下称 **DSH**）的整体方案。
> 旧版产品路线图（已全部完成）保留在 git 历史：`git show HEAD:plan.md`。
>
> 配套：根 `AGENTS.md`（协作规范）、`CLAUDE.md`（编码规范）、`Implementation/`（契约文档）。

---

## 0. 分支与协作策略（重要）

- 本融合项目的全部开发在**独立新分支**上进行，**不直接动 `dev`/`main`**：
  - 主线开发分支：`feat/dsh-integration`（从 `dev` 切出）
  - 大型子阶段可再开子分支（如 `feat/dsh-llm-gateway`、`feat/dsh-research-paper`），合回 `feat/dsh-integration`
- `dev` 保持 ResearchOS 当前可运行状态，作为**回退基线**：融合过程中任何一步出问题，切回 `dev` 即可恢复原工程。
- 阶段性成果（每完成一个 bundle/里程碑）合入 `feat/dsh-integration` 并打 tag（如 `dsh-m0-verified`、`dsh-p1-gateway`），便于回滚定位。
- 每次合并前跑对应服务测试（`make test-*`）；跨服务契约变更遵循根 `AGENTS.md` §5。
- 融合完成、验收通过后，`feat/dsh-integration` 再经 PR 合入 `main`（`main` 保持保护）。

---

## 1. 背景与目标

ResearchOS 目前是独立的三服务 Docker 工程（Next.js 前端 + Spring Boot 后端 + FastAPI ai-service），
经用户确认，将**全面融入 DSH**（`@deepseek-ai/dsh`，Cordis 插件树架构，`everything is a plugin`）。

**用户确认的需求（2026-08-17 问答结论）**：

| # | 需求 | 决策 |
| --- | --- | --- |
| 1 | ResearchOS 与 DSH 可拔插、互不影响 | **插件级**：ResearchOS 成为一组 DSH bundle，挂进 profile，可启停 |
| 2 | DSH 读 ResearchOS 文献 + DSH 提供 AI 给 ResearchOS | 文献经 **MCP server** 暴露给 DSH；AI 各自保留、配置共享 |
| 3 | 全局共享一个 API | 指 **LLM / Embedding 服务 API** 统一：新增 OpenAI 兼容**共享 LLM 网关**，两端都指向它 |
| 4 | 后端处理 | **TypeScript 重写为 DSH 原生 bundle**（Spring Boot / FastAPI 逐步下线） |
| 5 | 前端处理 | **DSH React 体系重写**（Next.js 最终移除） |
| 6 | 交付范围 | 本次只出方案（本文件） |

**融合目标形态**：

```
┌──────────────────────── DeepSeek Harness 进程（dsh web）────────────────────────┐
│  Cordis 插件树（profile: web + researchos bundle 层）                            │
│  ├─ dsh-base / dsh-web-app          DSH 自带：模型适配器/工具/会话/UI             │
│  ├─ dsh-llm-gateway  ★新增          OpenAI 兼容网关（/v1/chat + /v1/embeddings）  │
│  │                                 = 统一 LLM/Embedding API（需求 3）            │
│  ├─ research-* bundles ★重写        ResearchOS 业务域（auth/project/paper/...）   │
│  │    └─ 各 bundle 直连 MySQL（业务）+ PG（向量）                                │
│  ├─ research-mcp-server  ★新增      文献 MCP server（包装检索/读取/引用）         │
│  │    └─ 由 dsh-mcp-client 连接 → 工具注册进 ctx.tools（需求 2）                  │
│  └─ client/ui-research-* ★重写      文献库/助手/写作等页面（DSH React 体系）       │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲ 统一入口 http://127.0.0.1:3080（apiproxy: POST /api/<method> + SSE）
        │
   ┌────┴─────┐
   │  浏览器   │  （只访问 DSH 一个入口；不再访问 Next.js/3000）
   └──────────┘
```

---

## 2. DSH 调研结论（方案依据）

以下机制均已在本仓库源码/文档验证（`deepseek-harness-master/`）：

### 2.1 插件体系（需求 1 的载体）
- DSH 是 Cordis 插件树：`profile`（web/headless 模板）→ `bundle`（分发格式）→ `cordis.patch.yml`（补丁覆盖）。
- 新包规范：`packages/<group>/<pkg>/`，package.json 声明 `dsh.bundle`（插件）或 `dsh.client`（客户端 UI 包）。
- 安装/启停：`dsh plugin --profile <name> <args...>`（pnpm 转发 + 按安装态对账 bundle 层）。
- **可拔插结论**：ResearchOS = 一组 bundle，进 profile 的 bundles 列表即插即拔；卸载即复原 DSH。

### 2.2 统一 API 网关（需求 3 的技术背景）
- `packages/host/apiproxy`：**HTTP RPC 网关**，`POST /api/<method>`（JSON）+ SSE 流式推送。
- 域：session / host / events / workspace / command / skill / agentPreset / subagent。
- 新增业务域 = 注册 Remote 方法（`@Remote` → `ctx.remote.<namespace>`），由 `ctx.apiProxy` 承载。
- 信任门控：loopback 或配置 `trustedHosts` 才允许远程访问。

### 2.3 MCP（需求 2 的载体）
- DSH 是 **MCP 客户端**（`packages/mcp/mcp-client`，settings 配置），把外部 MCP server 的工具注册进 `ctx.tools`。
- **结论**：ResearchOS 文献能力以 MCP server 形态暴露（进程内或独立进程），DSH agent 即可检索/读取/引用文献。

### 2.4 LLM / Embedding（需求 3 的核心）
- DSH 通过 `ctx.llm` 适配器**消费**各 LLM（openai/anthropic/deepseek/pi-ai），**不对外提供 LLM API**。
- **结论**：需要新增「共享 LLM 网关」—— OpenAI 兼容端点，DSH 的 `ctx.llm` 适配器与 ResearchOS 的 ai-service 都指向它。

### 2.5 数据持久化
- DSH 提供 `ctx.storage` hub（json / sqlite KV 后端）+ session 持久化 SQLite；**无关系型业务库**。
- **结论**：ResearchOS 业务数据**保留 MySQL**（bundle 用 Kysely/TypeORM 连接），向量**保留 PG**（embedding 经共享网关）。数据资产不迁移。

---

## 3. 目标架构与关键设计决策

### 3.1 进程与部署
- 单一 DSH 进程承载全部；ResearchOS 的 Spring Boot / FastAPI / Next.js **全部下线**。
- MySQL / PostgreSQL 作为数据服务保留（容器或托管），由 bundle 连接。
- RabbitMQ / Redis：异步任务改走 DSH `ctx.jobs`/agent 事件；Redis 若仅作缓存则移除。

### 3.2 共享 LLM 网关（新 bundle：`dsh-llm-gateway`）
- 形态：DSH 内一个 bundle，暴露 OpenAI 兼容端点：
  - `POST /v1/chat/completions`（转 `ctx.llm` 流式/非流式）
  - `POST /v1/embeddings`（转 embedding 适配器）
- 配置：复用 DSH `ctx.credentials`（key/模型/限流集中管理）。
- 消费方：DSH 自身 `ctx.llm` 适配器（base_url 指向本网关）→ 避免回环，可让 DSH 适配器直连上游、仅 ResearchOS 走网关；或网关统一承载。**Phase 1 spike 定夺**。
- 备选：若网关放 DSH 内有回环/复杂度问题，用独立 LiteLLM 侧车替代，DSH 与 ResearchOS 都指向它。

### 3.3 文献 MCP server（新 bundle：`research-mcp-server`）
- 暴露工具（注册进 `ctx.tools`，agent 可调用）：
  - `literature_search(query, filters)` — 库内检索（映射旧 SearchController 语义）
  - `literature_get(paperId)` — 论文元数据 + summary（Paper Intelligence Card）
  - `literature_read(paperId, page?)` — 论文内容/PDF 段落（原 PdfViewer 数据源）
  - `literature_cite(paperIds, format)` — 引用生成（BibTeX/RIS/APA）
- 实现：bundle 内用 MCP SDK 起 server，`dsh-mcp-client` 配置连接（`mcp__<name>` settings）。
- 可拔插：MCP server 随 bundle 启停；不加载时 DSH 无文献工具，互不影响。

### 3.4 业务域 bundle（TS 重写清单，对应原 Spring Boot 控制器）
| 原后端模块 | 新 bundle | 说明 |
| --- | --- | --- |
| AuthController/AuthService | `research-auth` | 认证并入 DSH session；JWT 移除，改用 DSH 统一会话 |
| ProjectController | `research-project` | 项目 CRUD + 列表 |
| PaperController | `research-paper` | 上传（presigned）/创建/详情/列表/状态/删除/阅读状态 |
| FolderController | `research-folder` | 文件夹树/增删 |
| FileController | `research-file` | 本地/S3 文件读写（PDF 存储逻辑保留） |
| ReviewController + ai | `research-review` | 综述生成 → DSH agent + ctx.jobs |
| WritingController + ai | `research-writing` | 改写/翻译 → DSH agent（llm 走共享网关） |
| ExportController / CitationController | `research-export` / `research-citation` | 批量 BibTeX/RIS、参考文献 |
| SettingsController / SubscriptionController | `research-settings` / `research-subscription` | 用户设置、订阅 |
| ai-service paper_agent | `research-paper-card`（skill/agent） | Paper Intelligence Card 生成（llm/embedding 走共享网关） |

> AI 能力（paper/review/writing agent）**保留原有逻辑语义**，以 DSH 的 agent/skill/tool 形态重写，
> LLM/embedding 调用统一指向共享网关（需求 2+3 的结合点）。

### 3.5 前端 UI（DSH React 重写清单，对应原 Next.js 页面）
| 原页面 | 新 client 包 | 说明 |
| --- | --- | --- |
| /dashboard | `ui-research-dashboard` | 统计卡片 |
| /library（项目+论文库+上传+删除） | `ui-research-library` | 核心页面：项目/文件夹树/论文列表/上传进度 |
| /papers/[id]（PDF + Paper Card） | `ui-research-paper` | PdfViewer 保留（react-pdf） |
| /literature（文献检索） | `ui-research-literature` | 经 MCP 工具或 `ctx.remote.research.*` 调用 |
| /assistant / /writing / /settings | `ui-research-{assistant,writing,settings}` | 写作/助手/设置 |
- 通过 DSH `ConversationNodeDefinition` / `ui-*` 组件体系接入侧边栏与会话流。

### 3.6 数据层
- **MySQL**：保留现有表（app_user/project/folder/paper/ai_task/manuscript…），bundle 用 ORM 连接。
- **PostgreSQL**：保留 `paper_chunk` 向量表；embedding 由共享网关统一提供。
- 旧 RabbitMQ 任务队列、Redis 随下线移除；任务状态机映射到 DSH session/events。

---

## 4. 里程碑（建议顺序，每阶段可独立验收；全部在 `feat/dsh-integration` 分支上进行）

### Phase 0 — 能力验证（spike，0.5–1 周）
- [ ] 从 DSH 源码构建，跑通 `dsh web` + 自定义 profile。
- [ ] 建最小 bundle `research-hello`（`dsh.bundle` 声明 + 挂进 profile + 卸载验证）。
- [ ] 建最小 MCP server，`dsh-mcp-client` 连接成功，工具出现在 agent 工具表。
- [ ] spike 共享 LLM 网关：DSH 内 OpenAI 兼容端点 vs LiteLLM 侧车，选型定夺。
- [ ] 验证 `ctx.storage`（sqlite）承载 bundle 业务状态；确认 MySQL 直连 bundle 无架构障碍。
- **出口**：三项关键机制各有可运行 demo，设计决策（网关形态/数据层）定稿。打 tag `dsh-m0-verified`。

### Phase 1 — 共享 LLM 网关（需求 3 落地，1–2 周）

- [x] 实现 `dsh-llm-gateway`（chat completions + embeddings）。✅ 2026-08-17：改为**直连上游的 OpenAI 兼容代理**（不再依赖 ctx.llm/DSH provider 配置），环境变量配置（RESEARCH_LLM_* / RESEARCH_EMBEDDING_*，兼容 .env 兜底）；上游路径对齐 OpenAI SDK 语义 `{base}/chat/completions`
- [x] ResearchOS ai-service 改造：`OPENAI_BASE_URL`/`EMBEDDING_BASE_URL` 指向网关。✅ **调用模式已验证**：ai-service 容器内用真实 OpenAI SDK（llm/client.py 同款）`base_url` 指向网关 → 真实回复；**零代码改动**，切换 = .env 两行配置（见 `dsh-plugins/README.md`）
- [x] 正式切换 + 两端同 key/同模型验证。✅ 2026-08-17：dsh 常驻（`dsh-gateway.sh`）就绪后，`.env` 的 `OPENAI_BASE_URL`/`EMBEDDING_BASE_URL` 正式指向网关 `http://host.docker.internal:3081/v1`，重建 ai-service 容器；验证：容器内真实 OpenAI SDK chat 回「网关通」、embeddings 2048 维；真实业务 writing rewrite 经 backend-token → ai-service → 网关 → 上游返回润色文本。两端同 key（网关单点注入上游 key）、同 chat 模型（ark-code-latest）、同 embedding 模型（doubao-embedding-vision）。**遗留**：① 网关暂无限流（直连代理，key/模型已单点收口到网关 env）；② key 收口到 DSH `ctx.credentials` 待做
- **出口（已达成）**：统一 API 链路 + 正式切换验证通过，ResearchOS AI 与 DSH 指向同一 OpenAI 兼容入口（key/模型单点收口于网关）

### Phase 2 — 文献 MCP server（需求 2 数据侧落地，1–2 周）✅ 已完成（2026-08-17）
- [x] 实现 `research-mcp-server`（检索/读取/引用/向量检索 4 工具），DSH mcp-client 接入。✅ search/get 查 MySQL 真实文献；vector_search 经统一网关 embedding + PG 向量检索；cite 生成 BibTeX
- [x] DSH agent 里跑通「检索文献 → 读取 → 引用」端到端。✅ 经 apiproxy 会话验证：`literature_search(gibbon)` → 2 篇真实论文 → `literature_get(51)` 元数据+摘要 → `literature_cite([51],bibtex)` 真实 BibTeX → 中文汇报
- **出口（已达成）**：DSH agent 能检索/读取/引用 ResearchOS 文献（ResearchOS 后端仍独立跑，数据经 MCP 暴露）

### Phase 3 — 后端 TS 重写（需求 1/4 主体，4–8 周，按域拆分）
- [ ] `research-auth`：DSH 会话统一认证，迁移用户数据。
- [ ] `research-project` / `research-folder` / `research-paper` / `research-file`：核心文献域。
- [ ] `research-review` / `research-writing` / `research-paper-card`：AI 域（走共享网关）。
- [ ] `research-export` / `research-citation` / `research-settings` / `research-subscription`。
- [ ] 每个 bundle 完成后：旧 Spring Boot 对应控制器下线、`dsh plugin` 可单独卸载验证。
- **出口**：业务全量跑在 DSH 进程内，Spring Boot 下线；profile 卸载任一 bundle 不破坏其他功能。

### Phase 4 — 前端 DSH React 重写（4–6 周，与 Phase 3 并行）
- [ ] `ui-research-library` / `ui-research-paper`（核心）。
- [ ] `ui-research-literature` / `ui-research-writing` / `ui-research-assistant` / `ui-research-dashboard` / `ui-research-settings`。
- [ ] Next.js 前端下线，浏览器只访问 `:3080`。
- **出口**：单一 Web 入口，无 Next.js 残留。

### Phase 5 — 数据迁移与收尾（1–2 周）
- [ ] MySQL/PG 数据核对（表结构微调以适配新 ORM）、向量维度与网关 embedding 对齐。
- [ ] 移除 RabbitMQ/Redis/旧任务表；清理旧代码仓库残留。
- [ ] 可拔插回归：全量 profile 运行 → 卸载 research-* → DSH 裸跑正常 → 重装恢复。
- [ ] 更新 `Implementation/` 契约文档、AGENTS.md 模块边界。
- **出口**：融合完成，符合三项需求验收标准；`feat/dsh-integration` 合入 `main`（PR）。

---

## 5. 验收标准（对应用户三条需求）

1. **可拔插**：`dsh plugin` 卸载全部 `research-*` bundle 后，DSH 恢复原生形态且正常服务；重装后文献功能完整回归。
2. **双向能力**：DSH agent 能检索/读取/引用 ResearchOS 文献（MCP）；ResearchOS 的 AI 功能（paper/review/writing）在 DSH 内可用且 LLM/embedding 走共享网关。
3. **统一 API**：ResearchOS 与 DSH 的 LLM/Embedding 调用指向同一 OpenAI 兼容入口，key/模型/限流集中管理；前端只有一个入口 `:3080`。

---

## 6. 风险与注意事项

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| DSH 处于 developer preview | 兼容性破坏频繁，API 可能变 | Phase 0 锁定版本；每阶段升级时回归测试；关键机制尽量走稳定层（MCP/Cordis） |
| TS 重写工作量大 | 16 控制器/13 服务 + 5 页面 → 20+ bundle | 按域拆 Phase 3/4，每 bundle 可独立交付验收；AI 逻辑保留语义不重发明 |
| 共享网关回环问题 | DSH 适配器指向自身网关可能递归 | Phase 1 spike 定夺：网关统一承载 or 仅 ResearchOS 走网关；备选 LiteLLM 侧车 |
| 认证迁移 | ResearchOS JWT → DSH 会话，用户数据/会话兼容 | Phase 3 首做 auth，先并行双认证再切换 |
| 数据层 | MySQL/PG 保留但访问方从 Java/Python 变为 TS ORM | Phase 0 验证 ORM 连接；表结构改动走新迁移脚本并同步 `Implementation/40-database.md` |
| MCP 与 bundle 内直注册工具二选一 | 用户已选 MCP server，但 bundle 内直接 `ctx.tools.register` 更简单 | 保留 MCP 为数据暴露标准（可被 DSH 外工具复用）；bundle 内部调用走同一 MCP 工具面 |
| 主分支风险 | 直接改 dev/main 可能破坏现有可用工程 | **全部开发走 `feat/dsh-integration` 分支**，dev 作回退基线（见 §0） |

---

## 7. 开放问题结论（2026-08-17 静态预研已定，Phase 0 仅需验证）

| # | 问题 | 结论（源码依据） | Phase 0 验证点 |
| --- | --- | --- | --- |
| 1 | 共享 LLM 网关形态 | **DSH 内 bundle 优先**：`ctx.webServer` 支持 bundle 注册 HTTP 路由（WebRoute exact/prefix），`ctx.llm` 是 `LlmAdapter` 注册表 + `stream()` 流式 API → 网关 bundle 做 OpenAI 格式 ↔ `ctx.llm` 转换可行。LiteLLM 侧车作备选 | 最小网关 bundle 跑通 chat + embeddings |
| 2 | MySQL/PG 部署 | **保留现有容器**：DSH `ctx.storage` 只是 KV（json/sqlite），无关系查询能力；mysql2/pg 为标准 npm 依赖，bundle 直连。数据资产不迁移 | bundle 用 ORM 连 MySQL 跑通 CRUD |
| 3 | 认证迁移 | **`research-auth` bundle 自己提供用户认证**：DSH web 目前显式无认证（`packages/client/connection` 注释 "explicitly not authentication"，仅 loopback/same-origin 信任栅栏），DSH session 是 agent 会话不是用户账号。ResearchOS 用户表/JWT 逻辑保留在 auth bundle，前端经 apiproxy 调用 | 确认 apiproxy 信任栅栏与自定义认证的共存方式 |
| 4 | 文献 MCP server 位置 | **stdio 子进程**（`dsh-mcp-client` 配置支持 `transport: 'stdio'`，DSH spawn 子进程并随插件启停）→ 可拔插最彻底；`StreamableHttpConfig` 作远程部署备选 | stdio 子进程 MCP server 被 DSH 拉起/停止 |

## 8. Phase 0 执行清单（下次开工即做）

1. 在 DSH checkout 构建并跑通 `dsh web` + 自定义 profile（`dsh --profile web --dump-config` 验证插件树）。✅ 已验证（checkout 可直接运行）
2. 最小 bundle `research-hello`：`dsh.bundle` 声明 → `dsh plugin` 挂进 profile → 卸载验证（需求 1 可拔插的最小闭环）。✅ **已验证**（2026-08-17，见 `dsh-plugins/README.md`：装→`/research-hello/ping` 响应 JSON；拔→路由消失回落 SPA fallback；DSH 原生功能不受影响）
3. 最小 MCP server（stdio 子进程）→ `dsh-mcp-client` 配置连接 → 工具出现在 `ctx.tools`（需求 2 最小闭环）。✅ **已验证**（2026-08-17，见 `dsh-plugins/README.md`：profile patch 挂 `mcp-client` 行 → dsh 拉起 `research-mcp/server.js` 子进程稳定存活、`tools/list` 返回 `literature_search`、无报错；删 insert 即卸载）
4. `dsh-llm-gateway` spike：`ctx.webServer` 注册 `/v1/chat/completions` + `/v1/embeddings`，转发 `ctx.llm.stream()`；与 LiteLLM 对比后定稿（需求 3 最小闭环）。✅ **已验证**（2026-08-17，见 `dsh-plugins/README.md`：OpenAI 载荷 → `ctx.llm.stream()` 路由与格式转换正确，`text-delta`/`finish` chunk 处理正确；上游不可达时结构化 error 透出；`/v1/embeddings` 为 501 stub，embedding 适配器 Phase 1 定）
5. 数据层 spike：bundle 用 mysql2/pg 连现有 MySQL/PG，验证读写与向量维度对齐。✅ **已验证**（2026-08-17：mysql2 连 MySQL `researchos.paper` 返回 3 行、pg 连 PG `paper_chunk` 返回 522 行；宿主机 3306/5432 端口映射可达，bundle 用标准 TS 驱动直连无架构障碍）
6. 产出验证报告，更新本方案细节，开始 Phase 1。✅ 2026-08-17 Phase 0 全部完成（见 `dsh-plugins/README.md` 与 `feat/dsh-p0-verify` 分支提交记录）

---

*文档版本：v0.1（2026-08-17）。配套 DSH 源码调研：`deepseek-harness-master/`（docs/architecture.md、docs/api-gateway.md、packages/mcp/mcp-client、packages/host/apiproxy、docs/cookbook/adding-a-package.md）。*
