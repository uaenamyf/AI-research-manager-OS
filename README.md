# ResearchOS AI

> AI 驱动的学术研究助手 - PDF 智能解析、文献综述、问答助手
>
> **融合现状（2026-08-19）**：全部能力已融入 DeepSeek Harness（DSH）单实例，
> 浏览器单一入口 `http://localhost:3080`（研究区 = `packages/researchos/` 的
> `research-*` bundle + `ui-research-*` 客户端包 + research-ai-worker AI 管道）。
> legacy backend（Spring Boot）与 ai-service（FastAPI）已于 2026-08-19 移除，
> 仅保留 postgres + mysql 数据库层。详见根 `plan.md`。

## 🚀 快速开始

### 方式 1：基础设施 + DSH 网关

```bash
# 1. 复制环境变量配置
cp .env.example .env
# 编辑 .env，填入 LLM API Key 等必要配置

# 2. 启动数据库（postgres + mysql）
make infra-up

# 3. 启动 DSH（前端 + 业务 bundle + AI 管道，:3080）
make start-dsh
```

> **环境变量说明**：`scripts/dsh-gateway.sh` 从**仓库根目录** `.env` 读取
> LLM key / JWT / MySQL 等并注入 DSH 进程。
>
> **LLM 配置**：统一 LLM 网关（research-llm-gateway）读取 `OPENAI_API_KEY` +
> `RESEARCH_LLM_UPSTREAM_BASE_URL` + `OPENAI_DEFAULT_MODEL`，研究区全部 AI 能力
> （论文分析/卡片/综述/写作/嵌入）经该网关单点出口。

### 方式 2：本地开发启动

```bash
# 1. 启动基础设施
make infra-up

# 2. 启动 DSH（新终端）
make start-dsh   # scripts/dsh-gateway.sh start，http://localhost:3080
```

访问地址：
- 前端（DSH GUI）：http://localhost:3080
- LLM 网关（OpenAI 兼容）：http://localhost:3080/v1/chat/completions

## ✨ 功能特性

| 功能 | 状态 | 描述 |
|------|------|------|
| 📄 PDF 智能解析 | ✅ | 自动提取标题、作者、摘要、章节结构 |
| 🎯 向量化检索 | ✅ | pgvector 向量数据库语义检索 |
| 💬 论文问答 | ✅ | 基于 RAG 的智能问答（流式输出） |
| 📝 文献综述 | ✅ | 跨论文自动生成文献综述 |
| 👤 用户系统 | ✅ | JWT 认证、多租户隔离 |
| 💳 额度控制 | ✅ | FREE/PRO/RESEARCHER 三级计划（`ENFORCE_QUOTA` 开关，开发默认关闭） |
| 📁 S3 存储 | ✅ | 私有对象存储 + 预签名上传 |
| 🐳 Docker 部署 | ✅ | 生产级容器化部署 |
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
└───────────────┬───────────────────────────┬─────────────────┘
                │ 直连（MySQL）             │ 直连（PG）
┌───────────────▼───────────┐   ┌──────────▼─────────────────┐
│  MySQL（业务数据）         │   │  PostgreSQL + pgvector     │
│ user/project/paper/...    │   │  paper_chunk 向量存储       │
└───────────────────────────┘   └────────────────────────────┘
```

## 📁 项目结构

```
researchos-ai/
├── deepseek-harness-master/  # DeepSeek Harness（DSH，前端 GUI + 宿主，:3080）
│   └── packages/researchos/  # ResearchOS 融合包（bundle + AI worker + 网关 + UI）
│
├── infra/                    # 数据库基础设施
│   ├── docker-compose.yml    # postgres + mysql
│   ├── mysql-init/           # MySQL 建表脚本（首次初始化执行）
│   └── DEPLOYMENT.md         # 部署指南
│
├── scripts/                  # DSH 网关启停脚本（dsh-gateway.sh）
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

详细部署指南请参考 [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md)

```bash
# 生产环境启动
cp .env.example .env
# 编辑 .env 配置生产环境参数

# 1. 启动数据库
make infra-up
# 2. 启动 DSH（生产建议 systemd/pm2 托管）
make start-dsh
```

## 🛠️ 开发常用命令

```bash
# 查看所有可用命令
make help

# 查看 DSH 日志
make logs

# 清理资源
make clean
```

## 📝 环境变量

主要配置项（完整列表见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（生产必须修改） |
| `INTERNAL_TOKEN` | 后端 <-> AI 服务内部通信密钥 |
| `LLM_PROVIDER` | LLM 提供商（openai/anthropic/volcengine） |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `VOLC_*` | 对应 LLM API 密钥 |
| `STORAGE_*` | S3/R2 对象存储配置 |

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
- [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md) - 部署指南
- [CLAUDE.md](CLAUDE.md) - 编码规范
