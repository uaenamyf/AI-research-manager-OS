# ResearchOS AI

> AI 驱动的学术研究助手 - PDF 智能解析、文献综述、问答助手
>
> **融合现状（2026-08-18）**：前端已融入 DeepSeek Harness（DSH），浏览器单一入口
> `http://localhost:3080`（研究区 = `dsh-plugins/ui-research-workspace` 客户端包 +
> `research-*` bundle）。旧 Next.js 前端（`:3000`）已于 2026-08-19 移除，详见
> `dsh-plugins/README.md` 与根 `plan.md`。

## 🚀 快速开始

### 方式 1：Docker 一键启动

```bash
# 1. 复制环境变量配置
cp .env.example .env
# 编辑 .env，填入 LLM API Key 等必要配置

# 2. 启动全部服务
make up
# 或（等价，手动指定根目录 .env）
cd infra && docker compose --env-file ../.env --profile app up -d
```

> **环境变量说明**：compose 通过 `--env-file ../.env` 读取**仓库根目录**的 `.env`（Makefile 已内置该参数），
> 不要创建 `infra/.env`，否则两处配置会漂移。
>
> **LLM 配置**：`LLM_PROVIDER` 支持 `openai` / `anthropic`；国内网络无法直连 OpenAI 时，
> 可设 `OPENAI_BASE_URL`（火山引擎/DeepSeek 等 OpenAI 兼容端点）+ `OPENAI_DEFAULT_MODEL`（接入点 ID），
> `OPENAI_API_KEY` 填对应平台的 key（compose 已透传这三个变量）。

### 方式 2：本地开发启动

```bash
# 1. 启动基础设施
make infra-up

# 2. 启动后端（新终端）
cd backend
mvn spring-boot:run

# 3. 启动 AI Service（新终端）
cd ai-service
uvicorn app.main:app --reload

# 4. 启动 DSH 前端（新终端）
cd deepseek-harness-master
pnpm dsh web   # http://localhost:3080
```

访问地址：
- 前端（DSH GUI）：http://localhost:3080
- 后端 API：http://localhost:8080
- AI Service：http://localhost:8000
- RabbitMQ 管理：http://localhost:15672（guest/guest）

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
| 💳 Stripe 支付 | ✅ | Checkout 订阅 + webhook 回调（需配置密钥） |
| 🔗 Google OAuth | ✅ | 登录/注册页 + backend 授权码流程（需配置 `GOOGLE_CLIENT_ID/SECRET`） |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 (Frontend)                          │
│                  DeepSeek Harness GUI (:3080)                │
│          research-* bundle / ui-research-* 客户端包          │
└────────────────────────────────┬──────────────────────────────┘
                                 │ HTTP
┌────────────────────────────────▼──────────────────────────────┐
│                        后端 (Backend)                          │
│                   Spring Boot 3 + MyBatis Plus                 │
│    JWT 认证 / 文件存储编排 / 任务调度 / 额度控制(ENFORCE_QUOTA) / 回调处理    │
└────────────────┬───────────────────────┬──────────────────────┘
                 │                       │
        REST/SSE │                       │ RabbitMQ 异步
┌────────────────▼──────────┐  ┌────────▼──────────────────────┐
│   PostgreSQL + pgvector    │  │        AI Service             │
│    仅 paper_chunk 向量存储 │  │      FastAPI + Python         │
└───────────────────────────┘  │  PDF 解析 / Embedding / RAG   │
                               │    Agent 工作流 / LLM 调用     │
                               └───────────────────────────────┘
```

## 📁 项目结构

```
researchos-ai/
├── backend/                # Spring Boot 后端
│   ├── src/main/java/
│   │   ├── controller/     # API 控制器
│   │   ├── service/        # 业务逻辑层
│   │   ├── entity/         # 数据实体
│   │   ├── dto/            # 数据传输对象
│   │   ├── config/         # 配置类
│   │   └── common/         # 通用工具
│   └── Dockerfile
│
├── ai-service/             # FastAPI AI 服务
│   ├── app/
│   │   ├── agents/         # LLM Agent 实现
│   │   ├── rag/            # RAG 检索模块
│   │   ├── parser/         # PDF 解析
│   │   ├── worker/         # RabbitMQ 消费者
│   │   └── api/            # API 路由
│   └── Dockerfile
│
├── deepseek-harness-master/ # DeepSeek Harness（DSH，前端 GUI :3080）
├── dsh-plugins/            # ResearchOS 的 DSH 插件包（research-* bundle + ui-research-* 客户端）
│
├── infra/                  # 基础设施配置
│   ├── docker-compose.yml  # Docker Compose 编排
│   └── DEPLOYMENT.md      # 部署指南
│
├── .github/workflows/      # CI/CD 配置
│   └── ci.yml
│
├── .env.example            # 环境变量模板
├── Makefile                # 快捷命令
└── Implementation/         # 详细设计文档
```

## 🧪 运行测试

```bash
# 运行所有服务测试
make test

# 分别运行
make test-backend    # 后端 Maven 测试
make test-ai         # AI Service pytest
```

## 📊 测试覆盖

| 服务 | 测试类型 | 状态 |
|------|----------|------|
| Backend | 单元测试（H2） | ✅ |
| Backend | 集成测试（Testcontainers） | 🔄 |
| AI Service | PDF 解析 | ✅ |
| AI Service | Embedding 服务 | ✅ |
| AI Service | RAG 检索 | 🔄 |

## 🚢 部署

详细部署指南请参考 [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md)

```bash
# 生产环境启动
cp .env.example .env
# 编辑 .env 配置生产环境参数

cd infra
docker compose --profile app up -d
```

## 🛠️ 开发常用命令

```bash
# 查看所有可用命令
make help

# 查看日志
make logs
make logs-backend
make logs-ai

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
