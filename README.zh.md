# ResearchOS — AI 驱动的学术研究工作台

[English](README.md) | **中文**

> 基于 [DSH](https://github.com/deepseek-ai/deepseek-harness)（[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)）构建的学术研究 AI 工作台。DSH 是一款“一切皆插件”的开源 agent harness，底层是 [Cordis](https://github.com/cordiverse/cordis)。论文解析、RAG 问答、文献综述、写作助手、工作区代码 diff 同窗查看——所有能力都跑在一个 DSH 实例中。**零外部数据库、零 Docker、clone 即用。**

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![基于 DSH](https://img.shields.io/badge/built%20on-DSH-6e56cf.svg)
![dsh-plugin topic](https://img.shields.io/badge/topic-dsh--plugin-orange.svg)
![Node ≥22.5](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen.svg)
![SQLite only](https://img.shields.io/badge/database-SQLite%20only-green.svg)
![No Docker](https://img.shields.io/badge/no-Docker-blue.svg)
![Zero MQ](https://img.shields.io/badge/zero-RabbitMQ-red.svg)
![AI pipeline inline](https://img.shields.io/badge/AI%20pipeline-inline-purple.svg)
![RAG ready](https://img.shields.io/badge/RAG-ready-orange.svg)
![Paper Card](https://img.shields.io/badge/Paper%20Card-LLM-brightgreen.svg)
![Literature Review](https://img.shields.io/badge/Literature%20Review-multi--paper-ff69b4.svg)
![MCP server](https://img.shields.io/badge/MCP%20server-stdio-yellow.svg)

---

## ❓ 为什么选 ResearchOS

市面上大多数“AI 论文工具”只能给你一个聊天框。**ResearchOS** 是在 DSH 之上搭建的“完整科研闭环”：

- **工作区代码 diff 同窗查看** —— 在研究区里直接看 commit / file change / submodule 切换，不用在 git 客户端和工作台之间跳。
- **按用户的“研究区大模型”配置** —— *论文解析、写作、综述、嵌入向量* 使用的模型、Base URL、Key 都在 **设置 → 研究区大模型** 填，覆写系统默认值。每个用户一套。
- **导入过程实时进度条** —— 从在线检索或本地上传导入一篇论文后，弹窗会一直留在那，轮询状态、播动画进度条、失败时显示**实际错误**（不会再静默 FAILED）。
- **自动 Paper Card** —— PDF 解析一结束，LLM 同步生成结构化“论文情报卡片”，与 chunk 向量同时落库。
- **一键文献综述** —— 跨项目多选论文 → 后台生成 Markdown 综述 → 实时轮询任务进度。
- **MCP 文献检索** —— 文献检索 MCP 不仅是 UI 用，也可以从 DSH agent 直接调用。
- **一切皆 DSH 插件** —— 每个功能都是 Cordis 插件（`apply(ctx)`），不互相耦合。

整个系统跑在一个 Node 进程上、读写一个 SQLite 文件，`git clone + pnpm install + pnpm run build` 之后无需任何外部服务。

## ✨ 功能特性

| | 功能 | 说明 |
|---|------|------|
| 📄 | **PDF 智能解析** | 自动抽取标题、作者、摘要、章节结构 |
| 🪪 | **Paper Card** | LLM 生成的结构化“论文情报卡片” |
| 🔍 | **向量 RAG 检索** | SQLite BLOB + JS 余弦相似度，**零外部向量库** |
| 💬 | **论文问答** | 基于 RAG 的流式问答（`ui-research-paper`） |
| 📝 | **文献综述** | 多论文一键生成 Markdown 综述 |
| ✍️ | **写作助手** | 润色 / 扩写 / 缩写 / 翻译 / 审稿回复 / Cover Letter |
| 🧰 | **研究区工作台** | 项目 · 文件夹 · 论文 · 状态点 |
| 🔧 | **工作区代码 diff** | 在研究区里看 commit / 文件 / **submodule 导航** |
| ⚙️ | **研究区大模型设置** | 按用户配 LLM + Embedding（Base URL / 模型 / Key） |
| 📊 | **导入进度条** | 实时状态、真实失败原因 |
| 🔌 | **research-mcp** | `literature_search` / `literature_get` / `literature_cite` / `vector_search` |
| 🔑 | **无登录 / 无订阅** | 本地匿名模式，用户数据持久化于 SQLite |

## 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────────┐
│              DeepSeek Harness GUI  (:3080)                       │
│                                                                  │
│  ┌────────────────────┐   ┌──────────────────────────────────┐   │
│  │ 左 侧边栏：        │   │ 中间栏：                          │   │
│  │  · 研究区           │   │  · 会话 / 对话                    │   │
│  │  · 工作区           │   │  · 设置 → 研究区大模型            │   │
│  │  · 通用设置 / 预设  │   │                                   │   │
│  └─────────┬──────────┘   └──────────────┬───────────────────┘   │
│            │                              │                       │
│  ┌─────────▼──────────────────────────────▼───────────────────┐   │
│  │ 插槽（Slot）：sidebar.research · sidebar.workspaces ·    │   │
│  │              settings.section · details · chat node       │   │
│  └─────────┬──────────────────────────────┬───────────────────┘   │
│            │                              │                       │
│  ┌─────────▼──────────────────────────────▼───────────────────┐   │
│  │ 插件（Plugin）：                                          │   │
│  │  research-* bundles  （服务端，带鉴权的 REST）            │   │
│  │  ui-research-*       （客户端，基于 slot 的 UI）          │   │
│  │  research-ai-worker  （内联：PDF 解析→嵌入→生成卡片）      │   │
│  │  research-llm-gateway（统一 LLM/Embedding key 收口）       │   │
│  │  research-mcp        （stdio MCP，供 DSH agent 检索）     │   │
│  │  research-external-search（多源在线文献检索）             │   │
│  └─────────┬──────────────────────────────┬───────────────────┘   │
└────────────┼──────────────────────────────┼──────────────────────┘
             ▼                              ▼
   ~/.researchos/data/researchos.db   LLM 上游（OpenAI 兼容）
   （单 SQLite：业务表 +             ────────────────────────────
   paper_chunk BLOB 向量）            无 Docker · 无 MQ · 无外部数据库
```

架构遵循 [DSH 官方架构文档](docs/architecture.md)——“一切皆插件”。服务器侧插件树根节点是 `ctx.webServer`，UI 侧是 `ctx.slots`。**卸载任一 `research-*` 包不会破坏其他功能**。

## 🚀 快速开始（clone 即用）

**前置**：Node.js ≥ 22.5（建议 24+）、pnpm、git。

```sh
git clone https://github.com/uaenamyf/AI-research-manager-OS.git
cd AI-research-manager-OS
pnpm install          # postinstall 自动构建 literature-search-mcp vendor
pnpm run build
pnpm dsh web          # → http://localhost:3080
```

打开 <http://localhost:3080> 即可——**不需要注册、登录**，直接进入研究区。SQLite 数据库与上传目录在首次启动时自动创建。

> 研究区 LLM / Embedding 配置在 **设置 → 研究区大模型** —— 这是主路径，按 DSH 官方方式持久化（`~/.dsh/settings.yaml` 存 baseUrl/model，`~/.dsh/.credentials.yaml` 存 write-only API Key），每次解析 / 综述 / 写作 / 嵌入任务都会读取。留空时回退到内置默认值（火山方舟端点）。**无需 `.env`** —— UI 设置即可。

常用命令：

| 命令 | 作用 |
|------|------|
| `pnpm dsh web` | 启动研究工作台（默认 `:3080`）—— 唯一入口 |
| `rm -rf ~/.researchos/data ~/.researchos/uploads` | 重置本地数据（SQLite + 上传文件） |

> `pnpm dsh web` 自动完成 researchos 默认值引导（anon 开启、存储/工作区目录）+ vendor 构建——无需 `.env`、无需 Makefile、无需守护进程脚本。

## 🔬 ResearchOS 创新点（本项目在 DSH 之上新增的能力）

ResearchOS 是一个 DSH 插件套件，**不是对 DSH 本体的 fork**。下面所有变更都是 `packages/researchos/` 之下的纯新增，与 DSH 上游**零合并冲突**（上游升级只可能冲突在 DSH 本体被改过的文件）。

### 1. 研究区工作台侧栏

- `ui-research-workspace` 同时接入 DSH 侧边栏（占据一半）与详情列（通过 `priority: -100` 覆盖默认 `details` 注册）。
- 窗口最右缘 IDEA 风格的工具窗竖栏（`#research-railbar`，`position: fixed`，46px 宽）—— 点它可折叠 / 展开详情列，不影响当前会话。
- 三栏布局：**左侧文献库**（项目 · 文件夹 · 论文含状态点） / **右侧详情**（PDF 预览 / Paper Card / 在线检索 / 综述 / 写作） / **中间会话**。
- 拖一篇论文 → 拖到会话输入框 → 附加为文件上下文（`[研究区论文] <标题>（论文 #<id>）`）。
- 右侧文件预览可拖动：把工作区文件拖到聊天编辑器。

### 2. 工作区代码 diff（在研究区里看代码变更）

- `research-workspace` bundle 暴露 `GET /research-workspace/overview` 和 `GET /research-workspace/diff`，接受任何 DSH `ctx.workspaces` 注册的 workspace。
- 并排展示 **commit / 文件 / submodule** 导航：点 submodule 条目进入子仓（自动折叠到根），返回按钮（`WSIconBack`）回到上级。
- 目录计数 + 每顶层目录扫描配额，防止 monorepo 下 N×M 文件爆炸。
- 点文件 → patch / diff 视图（走 DSH `worker` runtime，不需额外 git 客户端）。
- 每目录文件类型图标、搜索过滤、文件大小元数据。

### 3. 在线文献检索（多源 MCP）

- `research-external-search` 是 vendor 端 `literature-search-mcp` 的薄包装（[`packages/researchos/external-search/vendor/literature-search-mcp/`](packages/researchos/external-search/vendor/literature-search-mcp/)）。
- **支持来源**：PubMed · EuropePMC · Crossref · OpenAlex · Semantic Scholar · arXiv · bioRxiv。
- 关键词、精确标题短语、作者、DOI、年份范围、仅开放获取等多种过滤项。
- 每张结果卡暴露 `pdf_url`；点 **「导入到研究区」** 打开导入弹窗。弹窗会**实时轮询状态**，失败时显示**实际错误原因**。
- 浏览器侧 `/research-external-search/pdf?url=...` 代理（带浏览器 UA / Referer），绕过 arxiv / europepmc / wiley 等的爬虫检测。

### 4. 内联 AI 管道（无 RabbitMQ / 无队列）

- `research-ai-worker` 被 paper / review bundles **内联调用**——无 MQ、无额外进程。详见 [analyze.js](packages/researchos/ai-worker/lib/analyze.js)。
- 每篇论文 6 步管道：**下载 PDF → 解析分块 → 嵌入 → 写 SQLite → 生成 Paper Card → READY**。
- 每篇论文有 **status**（UPLOADED / PROCESSING / READY / FAILED）和 **error**（失败时 worker 写 `{ error }` 到 `paper.summary`）。
- 按用户覆写：第一步就调用 `getUserResearchSettings(pool, paper.user_id)`，本篇论文的 LLM / 嵌入模型就是 **设置 → 研究区大模型** 里配的那个。

### 5. 按用户的研究区大模型设置

- 新增 `settings.section` 注册项：id `research-models`，order 20（紧跟 DSH `ui-settings-models` 的 order 10）。
- 表单：LLM（Base URL · 模型名称 · API Key）+ Embedding（Base URL · 模型名称 · API Key）。API Key 是 password 输入框，**保存后不回显**，留空 = 保持已保存的 Key。
- 通过 `PATCH /research-settings` 持久化到 `app_user.settings.research.{llm,embedding}`（SQLite JSON 字段）。
- 每次 `analyze` 和 `embedBatch` 调用都会读取。

### 6. 导入实时进度条

- 点击在线检索结果卡上的“导入”按钮后，弹窗保持打开，**每 3 秒轮询 `GET /research-paper/papers/:id`**，直到 READY 或 FAILED（上限 6 分钟）。
- PROCESSING：动画进度条 + “下载 → 解析 → 向量化 → 生成卡片”。
- READY：绿色进度条 + “导入成功 ✓ 已就绪” → 1.2s 后自动关窗 + 刷新论文树。
- FAILED：红色进度条 + **实际错误字符串**（如 `pdf download failed: ...timeout`），确定按钮变成“关闭”供用户读完。

### 7. 统一 LLM / Embedding 网关

- `research-llm-gateway` 在同一 DSH 端口上提供 `/v1/chat/completions` 和 `/v1/embeddings`（**OpenAI 兼容**）。
- `pnpm dsh web` 通过 `packages/researchos/scripts/researchos-bootstrap.mjs` 引导 researchos 默认值（anon 开启、存储/工作区目录）；网关在同一端口提供 `/v1/chat/completions` + `/v1/embeddings`。按用户配置走 DSH settings/credentials。
- 优雅回退：用户覆写失败（key 错、URL 错）时，worker 会记日志并用系统默认值重试。

### 8. research-mcp（DSH agent 工具）

- 以 `dsh-mcp-client` 行注册，DSH agent 可用工具：
  - `literature_search({ q, title, author, doi, year_from, year_to, open_access })` → 论文列表含 PDF URL
  - `literature_get({ id | doi | pmid })` → 元数据 + PDF URL
  - `literature_cite({ id, format })` → BibTeX / APA / MLA
  - `vector_search({ query, top_k })` → 本地 `paper_chunk` BLOB 余弦检索
- 任何 DSH agent（Cordis / `subagent` / `agent-loop`）都可以直接调用。

### 9. 无登录 / 无订阅 / 无 Docker / 无 MQ

- 匿名本地模式：`GET /research-auth/anon` 发放一个 httpOnly cookie，绑定到一个 demo 用户。无需注册、密码找回、OAuth。
- 已删除：`research-subscription`（Stripe）、Google OAuth、`infra/docker-compose.yml`、RabbitMQ producer/consumer。
- 其他一切都跑在一个 Node 进程 + 一个 SQLite 文件上。

## 🧱 仓库结构

本仓库是**单仓库**：DSH 全量源码在根目录，ResearchOS 全部位于 [`packages/researchos/`](packages/researchos/README.md)。DSH 源码通过 [`bash packages/researchos/scripts/upgrade-dsh.sh <tag> [--push]`](packages/researchos/scripts/upgrade-dsh.sh) 从 `deepseek-ai/deepseek-harness` 同步（fetch upstream tag → merge → build → vitest → push main）。

```
packages/researchos/
├── server/            # research-* server bundles（auth / project / folder / paper /
│   └── bundles/       # file / writing / review / paper-card / export / settings / workspace）
├── ai-worker/         # 内联 AI 管道：解析 → 分块 → 嵌入 → 生成卡片
├── llm-gateway/       # 统一 LLM/Embedding 网关（OpenAI 兼容，key 单点收口）
├── mcp/               # research-mcp：stdio MCP server，供 DSH agent 检索
├── ui/                # ui-research-* 客户端包
├── external-search/   # 在线文献检索（多源 MCP 包装）
├── lib/               # SQLite 抽象层（db.js：schema + 向量检索）
├── scripts/           # researchos-bootstrap.mjs（env+vendor 引导）、build-vendor.mjs、
│                      #   upgrade-dsh.sh（上游升级）
└── README.md          # 模块级 README（本文件同级）
```

仓库根目录中**与 ResearchOS 无关、但与宿主 DSH 相关的介绍性文档**（保留供使用底层 DSH 的读者查阅）：`AGENTS.md`、`CLAUDE.md`、`BRAND_GUIDELINES.md`、`CONTRIBUTING.md`、`docs/architecture.md`、`docs/cordis-primer.md`、`docs/agent-lifecycle.md`、`docs/defensive-patterns.md`、`docs/event-producer-consumer.md`、`docs/glossary.md`、`docs/graph-atlas.md`、`docs/module-graph.md`、`docs/persistence-catalog.md`、`docs/rescope.md`、`docs/testing.md`、`docs/tool-catalog.md`、`docs/tool-execution-pipeline.md`、`docs/web-styling.md`、`docs/postmortem/`。这些描述**宿主 DSH** 而非研究区。

## 🧪 测试与质量

- **CI**（`.github/workflows/researchos-ci.yml`）每次 push 触发：`node --check` 跑全部 server bundle / AI worker / 网关 / MCP / external-search 模块 + SQLite schema 健全性检查。
- 故意未附带 `packages/researchos/TESTING.md`——测试由 CI 与 DSH 的 vitest 体系承担。
- LLM 相关代码保持可 mock；CI 永远不消耗真实 token。

## 🤝 贡献

- 请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。
- 根据 [DSH 品牌指南](BRAND_GUIDELINES.md)，描述与 DSH 关系时请使用 **“DSH”** 缩写（例如“基于 DSH 构建”“DSH 兼容插件套件”），**避免在项目名中使用 “DeepSeek Harness”** 注册商标。
- 添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic 以便 DSH 生态内可发现。

## 🧭 进一步阅读

- 研究区模块 README —— [`packages/researchos/README.md`](packages/researchos/README.md)
- DSH 架构 —— [`docs/architecture.md`](docs/architecture.md)
- DSH 插件开发 —— [`docs/development.md`](docs/development.md)
- DSH 能力 seam —— [`docs/subsystems/`](docs/subsystems/) 与 [`docs/glossary.md`](docs/glossary.md)
- DSH 安全模式 —— [`docs/defensive-patterns.md`](docs/defensive-patterns.md)
- DSH 事件生命周期 —— [`docs/event-producer-consumer.md`](docs/event-producer-consumer.md)

## � 研发计划

ResearchOS 正在快速演进。计划中的下一步里程碑（可能调整）：

- **AutoResearch（autoresearch）** —— 全自动研究智能体：给定主题或研究问题后，智能体跨所有已接入数据源自动检索文献、筛选最相关论文，并围绕指定主题自动撰写结构化研究论文——全程无需人工干预，含引用追踪与章节草稿生成。
- **智能体全自动文献检索 + 论文撰写** —— DSH agent 从主题出发 → 检索并过滤文献 → 生成大纲 → 逐章起草 → 格式化引用（BibTeX/APA/MLA）→ 产出可投稿的手稿。
- 更多规划：文献综述质量评分、引用关系图谱可视化、扩展 `research-mcp` 的 agent 工具集。

欢迎提出想法、功能请求与 PR —— 通过 Issue 或 Discussion 一起来塑造路线图。

## �📄 License

[MIT](LICENSE)。仓库根的 DSH（subtree）遵循其自身 [MIT license](LICENSE)。`packages/researchos/` 下的 ResearchOS 增量为同一作者 MIT 许可。

## ⭐ 支持

如果 ResearchOS 让你的文献综述、读论文、学术写作更快，**点个 star** ⭐ 帮其他 DSH 用户发现它。Bug 报告与 PR 非常欢迎。
