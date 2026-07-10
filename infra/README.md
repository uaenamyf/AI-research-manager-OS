# infra - 本地开发与部署基础设施

本目录提供 ResearchOS AI 项目的本地开发环境与部署配置。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `docker-compose.yml` | 本地开发环境编排（PostgreSQL+pgvector / Redis / RabbitMQ + 应用服务） |
| `.env.example` | 环境变量模板（复制为 `.env` 后修改） |
| `.gitkeep` | 占位文件（保留目录结构用） |

> ⚠️ `.env` 文件已被 `.gitignore` 忽略，**不会入库**。新环境需从 `.env.example` 复制。

## 快速开始

### 1. 准备环境变量

```bash
cd infra
cp .env.example .env
# 编辑 .env，至少修改以下项：
#   - JWT_SECRET（生成方式：openssl rand -base64 48）
#   - INTERNAL_TOKEN（任意随机字符串）
#   - OPENAI_API_KEY 或 ANTHROPIC_API_KEY（使用 AI 功能时）
```

### 2. 启动基础设施

默认只启动 PostgreSQL、Redis、RabbitMQ 三个基础设施服务：

```bash
docker compose up -d
```

验证服务状态：

```bash
docker compose ps
# 三个服务均应为 healthy
```

### 3. 启动应用服务（可选）

当各服务的 `Dockerfile` 就绪后，可通过 `app` profile 启动应用层：

```bash
docker compose --profile app up -d
```

也可只启动单个应用服务（自动启动其依赖的基础设施）：

```bash
docker compose --profile app up -d backend
docker compose --profile app up -d ai-service
docker compose --profile app up -d frontend
```

### 4. 停止与清理

```bash
# 停止所有服务（保留数据）
docker compose down

# 停止所有服务并删除数据卷（⚠️ 清空数据库/缓存/队列）
docker compose down -v
```

## 服务访问地址

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | 数据库，`researchos/researchos` |
| Redis | `localhost:6379` | 缓存与会话 |
| RabbitMQ | `localhost:5672`（AMQP） | 消息队列 |
| RabbitMQ Management | `localhost:15672` | 管理界面，`guest/guest` |
| backend | `localhost:8080` | Spring Boot API |
| ai-service | `localhost:8000` | FastAPI AI 服务 |
| frontend | `localhost:3000` | Next.js 前端 |

## 架构说明

```
┌─────────────┐    REST API    ┌──────────────┐   HTTP/MQ   ┌──────────────┐
│  frontend   │ ─────────────> │   backend    │ ──────────> │  ai-service  │
│  Next.js    │ <───────────── │  Spring Boot │ <────────── │   FastAPI    │
└─────────────┘   统一响应/SSE  └──────────────┘  结果回调   └──────────────┘
                                      │
                          ┌───────────┼───────────┐
                          │           │           │
                     PostgreSQL   Redis       RabbitMQ
                     +pgvector   (缓存/会话)   (异步任务)
```

- **基础设施默认启动**：`docker compose up -d` 只起 Postgres/Redis/RabbitMQ，开发时各服务直接在宿主机用 IDE 运行。
- **应用层按需启动**：各服务 Dockerfile 就绪后用 `--profile app` 启动，用于端到端联调或部署验证。
- **数据持久化**：三个 named volume（`pgdata`、`redisdata`、`rabbitdata`），删容器不丢数据。

## 本地开发模式（推荐）

日常开发时，**基础设施用容器，应用用 IDE 跑**，便于断点调试：

```bash
# 1. 起基础设施
cd infra && docker compose up -d

# 2. backend 用 IDE 跑（application.yml 默认连 localhost）
#    IDE: 运行 ResearchOsApplication.java

# 3. ai-service 用 venv 跑
cd ai-service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# 4. frontend 用 npm 跑
cd frontend && npm install && npm run dev
```

## 相关文档

- [Implementation/90-config-deploy.md](../Implementation/90-config-deploy.md) - 环境变量与部署配置规范
- [Implementation/70-async-mq.md](../Implementation/70-async-mq.md) - RabbitMQ 拓扑与消息格式
- [Implementation/40-database.md](../Implementation/40-database.md) - 数据库 schema 与迁移
- [CLAUDE.md §13](../CLAUDE.md) - 依赖与环境约束
