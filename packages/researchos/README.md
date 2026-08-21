# ResearchOS AI — 学术研究助手

> **AI 驱动的学术研究工作台**：论文解析、RAG 问答、文献综述、写作助手，全部能力
> 以插件形式融入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）
> 单实例。**零外部数据库、零 Docker、clone 即用。**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-orange.svg)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen.svg)](https://nodejs.org)
[![Database](https://img.shields.io/badge/database-SQLite%20only-green.svg)](#技术架构)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue.svg)](../../.github/workflows/researchos-ci.yml)

> 本目录（`packages/researchos/`）是 ResearchOS 融合包：DSH 单实例承载的
> `research-*` bundle + `ui-research-*` 客户端包 + research-ai-worker AI 管道 +
> research-llm-gateway 统一网关 + research-mcp。仓库根 = 完整 DSH checkout
> （`AI-research-manager-OS`，upstream 可同步 `deepseek-ai/deepseek-harness`）。

---

## 🚀 为什么值得一看

这是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH，Cordis 全插件架构）
构建的**学术研究 AI 助手**。与同类项目最大的不同：

- **没有数据库要装**：MySQL / PostgreSQL / Redis / RabbitMQ 已全部下线，业务数据与
  论文向量统一存 **SQLite 单文件**（`node:sqlite`），向量为 BLOB + JS 余弦检索。
- **没有 Docker Compose**：不再需要起一堆容器，`pnpm dsh web` 一个命令跑起
  前端 + 业务 bundle + AI 管道 + LLM 网关 + MCP server。
- **所有 AI 能力插件化**：PDF 解析、Embedding、Paper Card、综述、写作全部内置于
  `research-ai-worker`，AI 管道 inline 直调（无 MQ），可按需拔插。
- **统一 LLM 网关**：`research-llm-gateway` 把 key / 模型单点收口为本地
  OpenAI 兼容端点（`/v1/chat/completions` + `/v1/embeddings`），支持按用户覆盖。
- **与 DSH 深度集成**：研究区是 DSH 的原生客户端包（侧边栏、会话节点、详情列、
  设置页），还能把文献检索作为 **MCP server** 暴露给 DSH agent 调用。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📄 PDF 智能解析 | 标题 / 作者 / 摘要 / 章节自动抽取，生成结构化 Paper Card |
| 🎯 向量化语义检索 | SQLite BLOB 向量 + JS 余弦相似度，零外部向量库 |
| 💬 论文问答 | 基于 RAG 的流式问答（`ui-research-paper` 聊天节点） |
| 📝 文献综述 | 跨论文勾选一键生成综述 |
| ✍️ 写作助手 | 润色 / 扩写 / 缩写 / 翻译 / 审稿回复 / Cover Letter |
| 🧰 研究区工作台 | 左侧文献库 + 右侧详情列 + 会话区三栏布局，拖拽上传 |
| 🗂️ Workspace 管理 | 文件树 / 改动对比 / git submodule 导航（点击直达子仓库） |
| ⚙️ 研究区大模型设置 | 设置页按用户配置 LLM 与 Embedding（Base URL / 模型 / Key），
  留空回落系统默认，AI 任务按此执行 |
| 🔌 research-mcp | stdio MCP server：`literature_search` / `literature_get` /
  `literature_cite` / `vector_search`，让 DSH agent 直接检索文献 |
| 🔑 匿名本地模式 | 移除登录 / 订阅 / OAuth，本地开箱即用；用户数据持久化于 SQLite |

## 🏗️ 技术架构

```
┌────────────────────────────────────────────────────────────────┐
│               DeepSeek Harness GUI  (:3080)                    │
│  ┌──────────────┐  ┌──────────────────────────────┐            │
│  │ 研究区工作台  │  │ 设置 → 研究区大模型（按用户） │            │
│  │ ui-research- │  │ settings.section 客户端包     │            │
│  │ library/paper│  └──────────────┬───────────────┘            │
│  │ citation/    │                 │                           │
│  │ workspace    │  research-* bundles（/research-* REST）      │
│  └──────┬───────┘                 │                           │
│         │                         │                           │
│  ┌──────▼─────────────────────────▼───────────────────────┐   │
│  │ research-ai-worker（解析/嵌入/卡片/综述/写作，inline）   │   │
│  │ research-llm-gateway（统一 LLM/Embedding 网关）          │   │
│  │ research-mcp（stdio MCP，供 agent 检索文献）             │   │
│  └──────┬──────────────────────────────┬──────────────────┘   │
└─────────┼──────────────────────────────┼──────────────────────┘
          ▼                              ▼
   ~/.researchos/data/researchos.db    LLM 上游（OpenAI 兼容）
   （SQLite 单文件：业务表 + 向量 BLOB）
```

## 🚀 快速开始（clone 即用）

**前置**：Node.js ≥ 22.5（建议 24+）、pnpm、git。

```bash
# 1. clone（单仓库，无 submodule）
git clone https://github.com/uaenamyf/AI-research-manager-OS.git
cd AI-research-manager-OS

# 2. 安装依赖并构建（一次性；postinstall 自动构建外部检索 vendor MCP；构建产物不入库）
pnpm install
pnpm run build

# 3. 启动（前端 + 业务 + AI 管道 + 网关，:3080）
pnpm dsh web
```

打开 http://localhost:3080 后，在 **设置 → 研究区大模型** 配置你的 LLM 与
Embedding（Base URL / 模型名 / Key）即可——这是主配置路径，按用户持久化到
SQLite，论文解析、综述、写作、嵌入任务都会读取。留空则回退内置默认（火山方舟
端点）。

> 可选：复制 `packages/researchos/.env.example` 为 `packages/researchos/.env`
> 可提供**系统级默认**（如 `OPENAI_API_KEY` / `RESEARCH_LLM_UPSTREAM_BASE_URL` /
> `OPENAI_DEFAULT_MODEL` / `EMBEDDING_MODEL`）。不是必需——UI 设置足够。

SQLite 数据库与上传目录在首次启动自动创建（`~/.researchos/data/researchos.db`、
`~/.researchos/uploads`），无需任何初始化。

常用命令（`make -C packages/researchos help` 查看全部）：

| 命令 | 作用 |
|------|------|
| `pnpm dsh web` | 启动研究工作台（默认 `:3080`）—— 推荐方式 |
| `make -C packages/researchos start-dsh` / `stop-dsh` | 守护进程式启动/停止（旧 shell 包装器，PID 文件） |
| `make -C packages/researchos status` / `logs` | 进程状态 / 日志（shell 包装器） |
| `make -C packages/researchos reset` | 重置本地数据（SQLite + 上传文件） |

## 🔌 与 DeepSeek Harness 的关系

- 本仓库包含 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
  的完整源码（可加 `upstream` remote 同步上游），`packages/researchos/` 为纯新增
  融合包（与上游**零冲突**，升级 merge 时冲突只会出现在修改过的上游文件）。
- 所有改进遵循 DSH 插件规范：`package.json` 声明 `dsh.bundle` / `dsh.client`、
  `cordis.patch.yml` 自挂载、`export function apply(ctx)` 插件形态，**可拔插**
  （卸载某个 `research-*` 包不破坏其余功能）。
- 上游升级：`bash packages/researchos/scripts/upgrade-dsh.sh <tag> [--push]`
  （fetch upstream tag → merge → 构建 → vitest 回归 → push main）。
- 按 DSH 社区惯例，本仓库可添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic
  以提升可发现性。

## 🧱 代码结构

```
packages/researchos/
├── server/            # research-* bundles（auth/project/folder/paper/file/
│   └── bundles/       #   writing/review/paper-card/export/settings/workspace）
├── ai-worker/         # AI 管道：PDF 解析、embedding、Paper Card、综述、写作
├── llm-gateway/       # 统一 LLM/Embedding 网关（OpenAI 兼容，key 单点收口）
├── mcp/               # research-mcp（stdio MCP server）
├── ui/                # ui-research-* 客户端包（library/paper/citation/workspace）
├── lib/               # SQLite 抽象层（db.js：schema + 向量检索）
├── scripts/           # dsh-gateway.sh（启停）、upgrade-dsh.sh（上游升级）
├── Makefile           # 快捷命令（start-dsh / stop-dsh / status / logs / reset）
└── TESTING.md         # 测试与验证指南

> `.env.example` 为环境变量模板（复制为 `.env` 使用）；`.env` 与运行产物不入库。
```

## 🧪 测试与质量

- CI（`.github/workflows/researchos-ci.yml`）：bundle / ai-worker / 网关 / MCP
  语法校验 + SQLite schema 校验。
- 融合包改动按 DSH 规范验证（`pnpm vitest run packages/client/ui-layout` 等），
  LLM 相关改动保持可 mock，CI 不消耗真实 token。

## 🤝 贡献与社区

- 欢迎提 Issue / PR；代码风格遵循 DSH 仓库根 `CLAUDE.md`，多服务协作遵循根 `AGENTS.md`。
- 想自己造一个 DSH 插件？读 [DSH 开发文档](../../docs/development.md)
  与 [DSH 客户端包规范](../../packages/client/AGENTS.md)。

## 📄 License

[MIT](../../LICENSE)。DSH 本体遵循其自身 [MIT License](../../LICENSE)。
