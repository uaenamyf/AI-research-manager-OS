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
| AuthController/AuthService | `research-auth` | ✅ 已实现（2026-08-17）：bundle 自持 JWT 认证（与旧后端**共享同一 JWT_SECRET**，HS256 双认证），不并入 DSH session（DSH web 显式无用户认证，见 §7 开放问题 3 结论）；前端经 apiproxy/HTTP 调用 |
| ProjectController | `research-project` | ✅ 已实现（2026-08-17）：项目 create/list/detail/delete，严格 user_id 过滤（越权 404），认证复用共享 JWT（research-auth 同款） |
| PaperController | `research-paper` | ✅ 已实现（2026-08-17）：create/import(Crossref)/list(文件夹过滤)/detail/status/card/move/reading/delete，MQ 触发与清理（paper.analyze/paper.delete 对齐 ai-service），upload-url 双认证阶段暂留旧后端 |
| FolderController | `research-folder` | ✅ 已实现（2026-08-17）：文件夹 create/tree/children/rename/move/delete/sort，user+project 归属校验，递归删除，防循环移动 |
| FileController | `research-file` | ✅ 已实现（2026-08-17）：本地文件存储（upload-url presign / multipart 上传 / 下载含 Range / 删除），旧后端已有 PDF 经代理兜底读取；S3 分支未实现（当前 STORAGE_TYPE=local） |
| ReviewController + ai | `research-review` | ✅ 已实现（2026-08-17）：综述任务 create + MQ review.generate + 任务轮询（ai-service 消费→RAG→LLM→回调 backend→任务 SUCCESS 全链路已验） |
| WritingController + ai | `research-writing` | ✅ 已实现（2026-08-17）：写作 Agent（6 动作 LLM 改写走共享网关 + llmOverride 直连/回退 + MyMemory 机器翻译），prompt 与 ai-service 同源 |
| ExportController / CitationController | `research-export`（含 citation） | ✅ 已实现（2026-08-17）：单篇/批量 BibTeX+RIS 导出、APA/MLA/GB7714 引用与参考文献；渲染与 Java 逐字节一致；批量强制 user_id 过滤（修复后端越权） |
| SettingsController / SubscriptionController | `research-settings` / `research-subscription` | ✅ 已实现（2026-08-17）：设置 GET/PUT/PATCH（llm/translation/knowledge 三段非空合并）；订阅 plans/checkout(Stripe REST)/webhook(签名校验+只升不降) |
| ai-service paper_agent | `research-paper-card`（skill/agent） | ✅ 已实现（2026-08-17）：POST /generate {text} → 共享网关生成结构化 Card（12 字段，prompt 与 ai-service 同源，JSON 容错解析）；skill/agent 形态留待 Phase 4 接入 DSH agent |

> AI 能力（paper/review/writing agent）**保留原有逻辑语义**，以 DSH 的 agent/skill/tool 形态重写，
> LLM/embedding 调用统一指向共享网关（需求 2+3 的结合点）。

### 3.5 前端 UI（DSH React 重写清单，对应原 Next.js 页面）
| 原页面 | 新 client 包 | 说明 |
| --- | --- | --- |
| /dashboard | `ui-research-dashboard` | 统计卡片 |
| /library（项目+论文库+上传+删除） | `ui-research-library` | ✅ v0.1（2026-08-17）：文献检索结果富卡片聊天节点（匹配标准 tool 事件，无需 host 改动）；完整项目/文件夹树/上传页待做 |
| /papers/[id]（PDF + Paper Card） | `ui-research-paper` | ✅ v0.1（2026-08-17）：literature_get → 完整 Paper Card 聊天节点（metadata + method/finding/limitation/future_work/tags）；PDF 查看器（react-pdf）待做 |
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
- [x] `research-auth`：DSH 内认证 bundle（首域起步）。✅ 2026-08-17：`dsh-plugins/research-auth` 连接 MySQL `app_user`，经 `ctx.webServer` 暴露 `/research-auth/{register,login,logout,me}`；JWT HS256 与旧 Spring Boot **共享同一 `JWT_SECRET`**（双认证），bcrypt 校验同款；响应沿用 `{code,message,data}` 契约。验证：注册→登录→me 全通；**token 双向互通**——bundle 签发的 token 被真实后端 `/api/auth/me` 接受（Bearer+cookie 均通过），后端同款 token 亦被 bundle 接受；负例（错密码/重复邮箱/无 token/坏 token/短密码）全部正确 4xx。装进 web profile（`dsh plugin add`），可随 profile 卸载。
- [x] `research-project` ✅ 2026-08-17：项目 create/list(分页)/detail/delete，所有查询 `WHERE user_id=?` 归属校验（跨用户访问/删除返回 404 已验）。
- [x] `research-folder` ✅ 2026-08-17：文件夹 create/tree(嵌套 children)/children/rename/move/delete/sort，user+project 归属校验（越权 404/403 已验），递归删除子树，move 防跨项目/自移/循环。
- [x] `research-paper` ✅ 2026-08-17：create/import(Crossref 补全)/list(folderId: null=根/-1=全部)/detail/status/card/move/reading/delete；MQ 全链路已验——创建发 paper.analyze 被 ai-service 消费并回调状态，删除发 paper.delete 被 ai-service 清理 chunk；配额开关 ENFORCE_QUOTA；upload-url 501（双认证阶段上传走旧后端）。
- [x] `research-file` ✅ 2026-08-17：本地文件存储——upload-url presign→multipart 上传→下载(全量+Range 206)→删除（~/.researchos/uploads，路径穿越防护）；旧后端已有 PDF 经代理兜底读取（Clemins.pdf 327KB 真实返回）；**核心文献域 4 bundle 全部完成**。
- [x] `research-writing` ✅ 2026-08-17：写作 Agent bundle——6 动作 LLM 改写（prompt 与 ai-service 同源，走共享网关；llmOverride 直连 + 失败回退系统默认；代码围栏剥离）+ MyMemory 机器翻译（源语言检测/500 字截断/配额检查）。
- [x] `research-review` ✅ 2026-08-17：综述生成 bundle——POST /generate（校验论文归属→ai_task PENDING→MQ review.generate，失败回滚）+ GET /:taskId（归属校验）；**全链路已验**：真实生成综述（ai-service 消费→RAG 12 片段→LLM→回调 backend→任务 SUCCESS，markdown 含 [P3] 引用）。
- [x] `research-paper-card` ✅ 2026-08-17：Paper Intelligence Card bundle——POST /generate {text}（12000 字符截断→共享网关→严格 JSON 12 字段：title/authors/year/doi/keywords/abstract/workflow/method/finding/limitation/future_work/tags，容错解析+字段默认值）；真实论文文本生成完整 Card 已验。**AI 域 3 bundle（writing/review/paper-card）全部完成**。
- [x] `research-export`（含 citation）✅ 2026-08-17：单篇/批量 BibTeX+RIS、APA/MLA/GB7714 引用与 bibliography；渲染与后端逐字节一致（BibTeX 实测相同）；批量端点强制 user_id 过滤（后端原实现不校验，越权隐患已修）。
- [x] `research-settings` + `research-subscription` ✅ 2026-08-17：设置 GET/PUT/PATCH（非空字段三段合并，null 不覆盖）；订阅 plans/checkout（Stripe REST + 错误路径）/webhook（HMAC 签名校验→checkout.session.completed 升级用户，只升不降已验：PRO→RESEARCHER 升、FREE 降级被拒）。**Phase 3 bundle 清单（11 个）全部完成**，剩余为旧控制器下线（Phase 3 出口）。
- [x] `dsh plugin` 可单独卸载验证 ✅ 2026-08-17（可拔插回归）：卸载 `research-folder` → 重启 → 该 bundle 路由消失（回落 SPA fallback）、其余 bundle（auth/project/paper/export/subscription）全部正常；重装 → 路由恢复。Phase 0 遗留的 `research-hello` 孤儿符号链接已清理。**旧控制器下线留待 Phase 4 前端切换后执行**（当前前端仍直连 backend `/api/*`，双认证阶段保留；下线映射见下）。
- **出口（部分达成）**：profile 卸载任一 bundle 不破坏其他功能 ✅ 已验；业务全量跑 DSH + Spring Boot 下线待 Phase 4 前端切换后执行。

**旧 Spring Boot 控制器下线映射**（Phase 4 前端切换到 `:3080` 后，按此逐个下线对应控制器）：

| 下线控制器 | 替代 bundle |
| --- | --- |
| AuthController / SecurityConfig(JWT) | `research-auth` |
| ProjectController / FolderController / PaperController / FileController | `research-project` / `research-folder` / `research-paper` / `research-file` |
| WritingController / ReviewController / ai-service writing_agent·review_agent·paper_agent | `research-writing` / `research-review` / `research-paper-card` |
| ExportController / CitationController | `research-export` |
| SettingsController / SubscriptionController | `research-settings` / `research-subscription` |
| RabbitMQ 任务下发/回调、ai-service MQ 消费 | 保留至 AI 能力完全迁入 DSH（Phase 5 移除 MQ） |

### Phase 4 — 前端 DSH React 重写（4–6 周，与 Phase 3 并行）
- [x] **可行性证明** ✅ 2026-08-17：`@researchos/ui-research-hello`（最小 out-of-tree 客户端包）——声明 `dsh.client` + `exports["./client"]` + 手写 `lib/client.js`（`__ModuleLoader__.load` 格式），注册 `sidebar.footer.action` 面板调用 `/research-project` 显示项目数；**机制已验证**：boot 清单自动注入新条目（39 条目中出现 `@researchos/ui-research-hello`）、`/plugins/<id>/client.js` 正常服务（content-type text/javascript，rev 命中）。结论：**out-of-tree UI 包无需重建 web app**，`dsh plugin add` + 重启即被浏览器 GUI 加载。渲染效果待浏览器查看 `http://127.0.0.1:3081` 侧边栏底部。
- [x] `ui-research-library` v0.1 ✅ 2026-08-17：文献库富卡片**聊天节点**——匹配标准 `tool/call`+`tool/result` 会话事件（ui-deliverables 同款模式，无需 host 发事件），跟踪 research MCP 文献工具（literature_search/vector_search）的 callId→名称，解析 tool/result JSON 累积论文列表，渲染「📚 ResearchOS 文献库」卡片。验证：boot 注入 + client.js 服务 + **真实会话事件重放**（turn/start→tool/call→tool/result → 节点数据含真实论文 id 50）。
- [x] `ui-research-paper` v0.1 ✅ 2026-08-17：`literature_get` → 完整 **Paper Intelligence Card 聊天节点**（标题/作者/年份/状态 + abstract/method/finding/limitation/future_work/tags×5）；真实事件重放验证（论文 id 51）。两节点按工具分流（search→library 列表、get→paper 详情），无冗余渲染。
- [x] `ui-research-citation` v0.1 ✅ 2026-08-17：`literature_cite` → **引用卡片聊天节点**（BibTeX/RIS 等宽渲染 + 复制按钮）；真实事件重放验证（`@article{DenaJ.Clink2019,...}`）。MCP 文献工具（search/get/cite）驱动的 UI 集合完成。
- [x] `ui-research-dashboard` v0.1 ✅ 2026-08-17：**用户消息关键词触发**（dashboard/仪表盘/统计/stats）→ 自取数统计面板（/research-project 项目数 + 各项目论文数 + /research-auth/me 套餐 + 最近项目列表）。**验证了「用户消息触发」模式**（非工具页面通用），为 writing/settings/assistant 铺路。
- [x] `ui-research-writing` v0.1 ✅ 2026-08-17：**写作面板节点**——用户消息关键词触发（写作/改写/润色/翻译/审稿/cover letter 等），从消息提取动作（翻译→translate、缩写→shorten…）+ 文本预填（剥连接词），渲染面板（文本域+动作下拉+指令+改写按钮）调 `/research-writing/rewrite` 显示结果；端到端已验证（真实润色输出）。
- [x] `ui-research-settings` v0.1 ✅ 2026-08-17：**设置面板节点**——关键词触发（设置/settings/配置/config）→ 读取 GET /research-settings 展示 LLM/翻译/Knowledge 三段表单，编辑后 PATCH 保存；GET/PATCH 端到端已验证（测试数据还原）。
- [x] `ui-research-literature` v0.1 ✅ 2026-08-17：**文献检索面板节点**——关键词触发（文献检索/搜文献/literature 等，消息可带查询词预填）→ 搜索框调新增的 `GET /research-paper/search?q=`（user 作用域，title/authors/doi LIKE，空 q 返回近期论文）→ 结果列表（标题/作者/年份/状态）。`ui-research-assistant` 由 DSH 会话天然承担，无需专门页面。
- [x] `ui-research-review` v0.1 ✅ 2026-08-17：**综述生成面板节点**——关键词触发（综述/文献综述/review，消息可带主题预填）→ 主题输入 + 论文勾选列表（调 /research-paper/search 空 q 取用户论文）→ 生成按钮（POST /research-review/generate）→ 轮询任务至 SUCCESS → 展示 Markdown 综述。真实端到端：task 8 PENDING→SUCCESS（真实综述含 Introduction）。
- [x] `ui-research-upload` v0.1 ✅ 2026-08-17：**上传面板节点**——关键词触发（上传/upload）→ 项目下拉（/research-project）+ 文件夹下拉（/research-folder，可选）+ PDF 选择 → 三步上传（presign → multipart → 建论文触发 MQ 分析）→ 展示 paper id + PROCESSING。三步端点端到端已验证（paper 54 创建后清理还原）。
- [x] `ui-research-project` v0.1 ✅ 2026-08-17：**项目/文件夹树管理面板**——关键词触发（项目/项目管理/文件夹/目录）→ 新建项目表单 + 项目列表（新建文件夹/删除项目）+ 每项目文件夹树（递归）+ 新建/删除文件夹。CRUD 端到端已验证（建项目 8/文件夹 22 → 树 → 删除还原）。**Phase 4 UI 共 11 包，缺口清零** → 可进入出口评估。
- [x] `ui-research-literature` ✅ 2026-08-17（见上，v0.1 已实现）
- [x] `ui-research-writing` ✅ 2026-08-17（见上，v0.1 已实现）
- [x] `ui-research-assistant` ✅ 2026-08-17：由 DSH 会话天然承担（聊天即助手），无需专门页面。
- [x] `ui-research-dashboard` ✅ 2026-08-17（见上，v0.1 已实现）
- [x] `ui-research-settings` ✅ 2026-08-17（见上，v0.1 已实现）
- [x] **Phase 4 出口评估** ✅ 2026-08-17：功能覆盖矩阵缺口清零（见下方「Phase 4 出口」章节）。
- [x] Next.js 前端下线 ✅ 2026-08-18：`docker compose --profile app stop frontend` 执行，`:3000` 连接拒绝；浏览器单一入口 `:3080` 达成（见下方「Phase 4 出口执行结果」）。
- **出口**：单一 Web 入口，无 Next.js 残留 ✅（3080 GUI 覆盖全部核心功能；回退命令保留）

## Phase 4 出口（执行计划，2026-08-17 定稿）

**覆盖矩阵**（DSH GUI 已覆盖 Next.js 全部核心功能）：

| Next.js 页面 | DSH GUI 节点 | 状态 |
| --- | --- | --- |
| /dashboard | ui-research-dashboard | ✅ |
| /literature | ui-research-literature + library 卡片 | ✅ |
| /papers/[id]（Paper Card） | ui-research-paper | ✅（PDF 查看器可选） |
| /writing | ui-research-writing | ✅ |
| /settings | ui-research-settings | ✅ |
| /assistant | DSH 会话天然承担 | ✅ |
| /library 上传 | ui-research-upload | ✅ |
| /library 项目/文件夹管理 | ui-research-project | ✅ |
| 综述生成 | ui-research-review | ✅ |
| 引用生成 | ui-research-citation | ✅ |

**下线步骤**：
1. 重启 3080 GUI（加载 research profile：15 bundle + 11 UI 包注入 boot）——**会打断当前 GUI 会话** ✅ 2026-08-18 已重启（12:13 手动 `pnpm dsh web`，boot 49 条目含 11 个 research UI 包）
2. 停 Next.js 容器：`docker compose --profile app stop frontend`（:3000 下线）✅ 2026-08-18 已执行
3. 验证：`:3000` 不可达；3080/3081 各触发词面板正常 ✅ 2026-08-18（见「Phase 4 出口执行结果」）
4. **保留** backend + ai-service（双认证 + MQ 管道仍被 DSH bundle 使用，Phase 5 再评估）✅ 保持运行
5. **回退**：`docker compose --profile app start frontend`；3080 保持运行（双模式）——未执行，如需要随时可回退

> 决策点：① 3080 重启打断会话——已发生（本次会话即重启后的实例），但**该实例为手动启动未注入网关 env**，见下方遗留；② 是否立即停 Next.js vs 保持双模式——**已执行立即停**（出口验证通过）。

### Phase 4 出口执行结果（2026-08-18）

**执行动作**：
1. 恢复统一 LLM 网关：`dsh-gateway.sh start 3081`（脚本自动注入 `.env` 的 key/模型 + JWT/MySQL 等全部 env；3080 被 GUI 占用自动 bump 到 3081）——**网关恢复前 3081 无监听，ai-service 的 LLM 调用全链路已死**（`.env` 指向 `host.docker.internal:3081/v1`）。
2. 停 Next.js：`cd infra && docker compose --env-file ../.env --profile app stop frontend`。

**验证结果（全部通过）**：
- 网关 3081：`/v1/chat/completions` 真实上游回复（火山引擎）；`/v1/embeddings` 2048 维 doubao-embedding-vision
- ai-service 容器内真实 OpenAI SDK（走 `OPENAI_BASE_URL` → 3081 网关）：chat 真实回复 + embeddings 2048 维
- `:3000` 连接拒绝（frontend 容器 Stopped）；backend/ai-service/mysql/pg/rabbitmq/redis 正常
- 3080 GUI：boot 清单 49 条目含 **11 个 research UI 包**；`/plugins/@researchos/ui-*/client.js` 200 text/javascript
- 3080 路由：public（research-hello/ping、research-subscription/plans）200；protected（research-project/auth/me/paper/settings）无 token 401（鉴权生效）
- 3080 真实认证流：register → cookie → `/research-auth/me`、`/research-project`、`/research-settings` 全部 code 0（测试用户已删）
- 3080 → 网关 LLM 链路：`/research-writing/rewrite`（polish）经 bundle 默认网关 3081 → 真实润色输出（测试用户已删）

**遗留（Phase 5 入口）**：
- ✅ **3080 GUI 已规范重启（2026-08-18）**：单实例合并——杀掉手动实例（无 env）与 3081 网关实例，新实例驻 3080（pid 56141，全量 env 注入：key/JWT/MySQL/RESEARCH_GATEWAY_URL=3080）；`.env` 的 `OPENAI_BASE_URL`/`EMBEDDING_BASE_URL` 已从 3081 改为 **3080** 并重建 ai-service（容器内真实 SDK 经 3080 网关回 "Pong!"）。验证：网关 chat/embeddings 200（真实上游、2048 维）、MCP 子进程 env 指向 3080（vector_search 修复）、boot 49 条目含 11 UI 包、writing rewrite 真实润色。**3081 网关实例已退役**（单实例架构：GUI + 网关 + bundle 同驻 3080）。
- 网关限流 ✅ 2026-08-18：per-client 令牌桶（RESEARCH_GATEWAY_RPM 默认 120/min，按 Authorization/X-API-Key/IP 分桶，429+retry-after）；实测 130 连发 → 101×200 + 29×429。
- key 收口 ✅ 达成验收（env 单点：`.env` → dsh-gateway.sh → 网关，key/模型/限流集中管理）；`ctx.credentials` 深度迁移记为可选增强（web profile 未挂载 credentials 服务）。

### Phase 5 — 数据迁移与收尾（1–2 周）

- [x] MySQL/PG 数据核对、向量维度与网关 embedding 对齐 ✅ 2026-08-18（详见下方「Phase 5 数据核对结果」）。
- [x] 移除 RabbitMQ/Redis ✅ 2026-08-18：AI 管道迁入 DSH 后 MQ 零消息，容器已移除（compose 注释服务 + 移除 depends_on/env/卷；ai-service 空 RABBITMQ_URL 跳过消费者）。验证：ai-service 日志「跳过 MQ 消费者」、backend 存活（文件代理正常）、inline e2e 全通。MySQL 旧表（conversation/manuscript/annotation）保留（数据资产不迁移原则）。
- [x] 可拔插回归 ✅ 2026-08-18（全量）：卸载全部 24 个 @researchos/* 包（13 bundle + 11 UI）+ 摘除 mcp insert → 重启 → **DSH 裸跑正常**（GUI 200、boot 0 条 researchos、/research-hello/ping 回落 SPA HTML）；重装全部 24 包 + 恢复 mcp insert → 重启 → **功能完整回归**（boot 49 条目含 11 UI、worker/auth/gateway 真实 JSON 路由、MCP 子进程存活、paper 分析 READY、writing 润色、review SUCCESS）。坑位记录：全量移除后 profile package.json 的 `dependencies` 键消失，重装须用硬编码清单而非读 deps。
- [ ] 更新 `Implementation/` 契约文档、AGENTS.md 模块边界。
- **出口**：融合完成，符合三项需求验收标准；`feat/dsh-integration` 合入 `main`（PR）。

### Phase 5 数据核对结果（2026-08-18）

- **表健康**：MySQL app_user=3 / research_project=1 / folder=6 / paper=3 / ai_task=6；PG paper_chunk=141（核对前 569）。
- **向量对齐**：PG `embedding vector(2048)` ↔ 网关 embedding 2048 维（doubao-embedding-vision）✅ 一致。
- **孤儿 chunk 清理**：PG 存在 paper 30/36/37 的 chunk（MySQL 已无对应 paper）——经正规契约通道修复：向 `researchos.ai.task` / `paper.delete` 发布 3 条消息 → ai-service `_on_paper_delete_message` 清理（30→276、36→53、37→99 个 chunk）→ PG 剩余 chunk 仅含 49/50/51，与 MySQL paper 完全一致。
- **结论**：双库最终一致达成；bundle 用原生 SQL 直连（无 ORM 迁移需求），表结构无需微调。

### Phase 5 AI 管道迁入 DSH（research-ai-worker）✅ 核心实现 + 独立验证（2026-08-18）

**形态**：新包 `dsh-plugins/research-ai-worker`（bundle + 独立 CLI）——把 ai-service 的 AI 管道原样移植为 TS/Node，直连 MySQL（业务表）+ PG（paper_chunk），LLM/embedding 走统一网关 3080：

```
lib/parser.js   PDF 解析 + 章节切分 + 滑动窗口（pdf_parser.py 逐字移植，CHUNK_SIZE=512/OVERLAP=64，
                section 正则同源，references 跳过；pdf-parse 提取 + 控制字符清理）
lib/embed.js    /v1/embeddings 批量（每批 10、批间 1s、429 指数退避，embedding.py 同款）
lib/vector.js   PG paper_chunk 写/余弦检索（<=>）/删除（vector_store.py 同款 SQL）
lib/card.js     Paper Card 生成（PAPER_CARD_SYSTEM 同源 + 容错 JSON 解析）
lib/llm.js      网关 chat + llmOverride 直连/回退（writing bundle 同款路由）
lib/analyze.js  analyzePaper：下载 PDF → 切分 → embedding → PG 写入 → Card → MySQL status READY/summary
lib/review.js   generateReview：metadata → 跨论文 RAG（top 12）→ LLM → ai_task SUCCESS {markdown}
index.js        bundle 包装：POST /research-ai-worker/{analyze,cleanup,review}（JWT 或 X-Internal-Token）
cli.js          独立 CLI：node cli.js analyze|cleanup|review（不重启 dsh 即可验证）
```

**独立验证（CLI 直连真实基础设施，测试数据已还原）**：
- analyze paper 55（克隆 paper 51 的 Clink.pdf 1.15MB）：PDF 经 backend 下载全量 → **47 chunks（与 Python 管道对同一 PDF 逐字一致）** → 2048 维 embedding → PG 写入 47 行 → 真实 Card（DOI/tags/method）→ paper status READY
- review task 9（papers=[55], topic=Acoustic classification）：RAG 检索 12 chunks → 真实 Markdown 综述 **10300 字符**（Introduction/Thematic Synthesis/Methodological Comparison/Gaps/Conclusion/References 含 [P1] 引用）
- cleanup：DELETE paper_chunk 47 行
- 修复过程中发现并处理：pdf-parse 文本含 NUL 控制字符（PG 拒绝，parser 增加 sanitize）；PG 连接串走 config；**research-file 代理大文件截断 bug（见下）**

**集成（已编码，env 门控默认关 = MQ 管道不变，重启后一键切换）**：
- `research-paper`：`RESEARCH_AI_INLINE=1` 时 create/import 触发改调 `/research-ai-worker/analyze`、DELETE 改调 `/cleanup`（X-Internal-Token），否则保持 MQ
- `research-review`：`RESEARCH_AI_INLINE=1` 时 generate 改调 `/research-ai-worker/review`（顺带补上 llmOverride 透传），否则保持 MQ
- **切换步骤（✅ 2026-08-18 已执行并验证）**：`dsh plugin add research-ai-worker` → `.env` 设 `RESEARCH_AI_INLINE=1`（dsh-gateway.sh 新增导出）→ 重启 GUI → 端到端验证全部通过：
  - paper 56 create → inline worker 分析（日志 47 chunks → READY，真实 Card 落库）→ PG 47 chunks
  - review task 10-21 全部 SUCCESS（7.5K-10.5K 字符真实综述，RAG 12 chunks）
  - paper delete → inline cleanup → PG chunks 清零
  - **ai-service 日志零 MQ 消息**（分析/综述均绕过 RabbitMQ，0 条）→ 观察期后可移除 RabbitMQ/ai-service MQ 消费（Phase 5 出口）
  - 测试数据（用户/项目/论文/任务）已全部还原
- 回退：`RESEARCH_AI_INLINE=0` 重启即回 MQ 管道（ai-service 消费者仍在线）
- 回退：去掉 env 或卸载 worker 并重启

**已知问题（待下次重启验证）**：research-file 的 legacy 代理（fetch backend 后转发）在经 dsh 进程响应大文件（>300KB）时偶发截断（curl exit 18 / undici terminated，backend 直连无此问题）。worker 已用 **backend 直连优先**规避（与 ai-service 同路径）；research-file 代理健壮性补丁（timeout + connection 控制）与 GUI PDF 查看器（v0.2）一并处理。

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
