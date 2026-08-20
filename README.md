# ResearchOS AI

> AI 驱动的学术研究助手 - PDF 智能解析、文献综述、问答助手
>
> **融合现状（2026-08-22）**：全部能力已融入 DeepSeek Harness（DSH）单实例，
> 浏览器单一入口 `http://localhost:3080`（研究区 = `packages/researchos/` 的
> `research-*` bundle + `ui-research-*` 客户端包 + research-ai-worker AI 管道）。
> **零数据库依赖**：MySQL/PostgreSQL 已全部替换为 SQLite（`node:sqlite`，随应用
> 自动创建于 `~/.researchos/data/researchos.db`），向量存 BLOB + JS 余弦检索，
> 无需安装任何数据库或 Docker，**clone 即用**。详见根 `plan.md`。

## 🚀 快速开始（clone 即用，无需数据库/Docker）

```bash
# 1. clone（含 DSH submodule）
git clone --recurse-submodules <repo-url>
cd AI-research-manager-OS

# 2. 安装 DSH 依赖（一次性，需 Node 22.5+，建议 24+）
cd deepseek-harness-master && pnpm install && cd ..

# 3. 复制环境变量并填入 LLM key
cp .env.example .env
# 编辑 .env：OPENAI_API_KEY（必填）+ RESEARCH_LLM_UPSTREAM_BASE_URL / OPENAI_DEFAULT_MODEL

# 4. 启动 DSH（前端 + 业务 bundle + AI 管道，:3080）
make start-dsh
```

打开 http://localhost:3080 即可注册/登录使用。数据库文件与上传 PDF 在首次启动时
自动创建（`~/.researchos/data/researchos.db`、`~/.researchos/uploads`），无需任何初始化。

> **环境变量说明**：`scripts/dsh-gateway.sh` 从**仓库根目录** `.env` 读取
> LLM key / JWT 等并注入 DSH 进程。
>
> **LLM 配置**：统一 LLM 网关（research-llm-gateway）读取 `OPENAI_API_KEY` +
> `RESEARCH_LLM_UPSTREAM_BASE_URL` + `OPENAI_DEFAULT_MODEL`，研究区全部 AI 能力
> （论文分析/卡片/综述/写作/嵌入）经该网关单点出口。

### 从旧版（MySQL/PG）数据迁移

> 已删除（2026-08-22）：原 `infra/`（docker-compose）与 `scripts/migrate-mysql2sqlite.mjs`
> 已移除。若你有旧 MySQL/PG 数据，迁移脚本保留在 git 历史
> （`git show HEAD:scripts/migrate-mysql2sqlite.mjs`，需自行起 MySQL/PG 容器配合使用）。

访问地址：
- 前端（DSH GUI）：http://localhost:3080
- LLM 网关（OpenAI 兼容）：http://localhost:3080/v1/chat/completions

## ✨ 功能特性

| 功能 | 状态 | 描述 |
|------|------|------|
| 📄 PDF 智能解析 | ✅ | 自动提取标题、作者、摘要、章节结构 |
| 🎯 向量化检索 | ✅ | SQLite BLOB + JS 余弦相似度语义检索（零外部服务） |
| 💬 论文问答 | ✅ | 基于 RAG 的智能问答（流式输出） |
| 📝 文献综述 | ✅ | 跨论文自动生成文献综述 |
| 👤 用户系统 | ✅ | JWT 认证、多租户隔离 |
| 💳 额度控制 | ✅ | FREE/PRO/RESEARCHER 三级计划（`ENFORCE_QUOTA` 开关，开发默认关闭） |
| 📁 本地文件存储 | ✅ | PDF 存本地目录 `~/.researchos/uploads`（无需对象存储） |
| ✅ 单元测试 | ✅ | 后端/AI 服务测试覆盖 |
| 🔄 CI/CD | ✅ | GitHub Actions 自动化流水线 |
| 💳 Stripe 支付 | ✅ | Checkout 订阅 + webhook 回调（research-subscription bundle，需配置密钥） |
| 🔗 Google OAuth | ✅ | 登录/注册页 + JWT 授权码流程（research-auth bundle，需配置 `GOOGLE_CLIENT_ID/SECRET`） |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                  DeepSeek Harness GUI (:3080)               │
│    research-* bundle（auth/project/folder/paper/file/...）  │
│    research-ai-worker（解析/嵌入/卡片/综述/写作，inline）    │
│    research-llm-gateway（统一 LLM/Embedding 网关）           │
│    ui-research-* 客户端包（聊天节点/研究区面板）             │
└───────────────────────────┬─────────────────────────────────┘
                            │ node:sqlite（零外部数据库）
              ┌─────────────▼──────────────┐
              │ ~/.researchos/data/researchos.db │
              │ 业务表 + paper_chunk（BLOB）│
              └────────────────────────────┘
```

## 📁 项目结构

```
researchos-ai/
├── deepseek-harness-master/  # DeepSeek Harness（DSH，前端 GUI + 宿主，:3080）
│   └── packages/researchos/  # ResearchOS 融合包（bundle + AI worker + 网关 + UI）
│       └── lib/db.js         # SQLite 抽象层（schema + 向量检索，node:sqlite）
│
├── scripts/                  # DSH 网关启停（dsh-gateway.sh）
├── Implementation/           # 契约/实现文档
├── .env.example              # 环境变量模板
├── Makefile                  # 快捷命令
└── plan.md                   # DSH 融合方案与里程碑
```

## 🧪 运行测试

- research bundle / 客户端包：按 `deepseek-harness-master/packages/researchos/` 与
  DSH `packages/client/AGENTS.md` 规范验证（DSH 自带 vitest 体系）。
- 原 backend（JUnit）/ ai-service（pytest）测试随服务移除已归档在 git 历史
  （`git show HEAD:backend/...`）。

## 🚢 部署

零数据库依赖，单进程即可跑。生产建议 systemd/pm2 托管 `make start-dsh`。

```bash
cp .env.example .env
# 编辑 .env 配置生产环境参数（JWT_SECRET / INTERNAL_TOKEN / LLM key）
make start-dsh
```

备份 = 复制 `~/.researchos/data/researchos.db` + `~/.researchos/uploads/`。

## 🛠️ 开发常用命令

```bash
# 查看所有可用命令
make help

# 查看 DSH 日志
make logs
```

## 📝 环境变量

主要配置项（完整列表见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（生产必须修改） |
| `INTERNAL_TOKEN` | 内部服务通信密钥 |
| `OPENAI_API_KEY` | LLM 密钥（必填，统一网关出口） |
| `RESEARCH_LLM_UPSTREAM_BASE_URL` / `OPENAI_DEFAULT_MODEL` | 兼容端点上/模型 |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | 嵌入模型与维度（默认 2048） |
| `RESEARCH_DATA_DIR` / `RESEARCH_STORAGE_LOCAL_DIR` | SQLite 目录 / PDF 目录（默认 `~/.researchos/...`） |
| `STRIPE_*` | Stripe 订阅配置（可选） |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth（可选） |

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

MIT License

## 🆘 技术支持

如有问题，请提交 Issue 或查看：
- [Implementation/README.md](Implementation/README.md) - 详细设计文档
- [CLAUDE.md](CLAUDE.md) - 编码规范
