# infra - 本地开发与部署基础设施

本目录提供 ResearchOS AI 项目的本地开发环境与部署配置。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `docker-compose.yml` | 本地开发环境编排（PostgreSQL+pgvector / MySQL） |
| `mysql-init/` | MySQL 建表脚本（首次空数据卷初始化执行一次） |
| `DEPLOYMENT.md` | 部署指南 |

> ⚠️ `.env` 文件已被 `.gitignore` 忽略，**不会入库**。新环境需从根目录 `.env.example` 复制。

## 快速开始

### 1. 准备环境变量

```bash
cp .env.example .env   # 仓库根目录
# 编辑 .env，至少修改以下项：
#   - OPENAI_API_KEY / RESEARCH_LLM_UPSTREAM_BASE_URL（DSH 网关经 scripts/dsh-gateway.sh 注入）
#   - JWT_SECRET（生成方式：openssl rand -base64 48）
#   - INTERNAL_TOKEN（任意随机字符串）
```

### 2. 启动数据库（postgres + mysql）

```bash
docker compose up -d
```

验证服务状态：

```bash
docker compose ps
# postgres / mysql 均应为 healthy
```

> legacy backend / ai-service 已于 2026-08-19 移除（AI 管道迁入 DSH
> `research-ai-worker`）；Redis/RabbitMQ 已随 Phase 5 下线，定义保留在注释中便于回退。

### 3. 启动 DSH（前端 + 业务 bundle + AI 管道，:3080）

```bash
cd .. && bash scripts/dsh-gateway.sh start
# 或 make start-dsh
```

### 4. 停止与清理

```bash
# 停止所有服务（保留数据）
docker compose down

# 停止所有服务并删除数据卷（⚠️ 清空数据库）
docker compose down -v
```

## 服务访问地址

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | 向量库（paper_chunk），`researchos/researchos` |
| MySQL | `localhost:3306` | 业务库（user/project/paper/...），`researchos/researchos` |
| DSH GUI | `localhost:3080` | DeepSeek Harness GUI + research bundles（`scripts/dsh-gateway.sh` 启动） |
| LLM 网关 | `localhost:3080/v1/chat/completions` | OpenAI 兼容统一网关 |

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                  DeepSeek Harness GUI (:3080)               │
│    research-* bundle（auth/project/folder/paper/file/...）  │
│    research-ai-worker（解析/嵌入/卡片/综述/写作，inline）    │
│    research-llm-gateway（统一 LLM/Embedding 网关）           │
└───────────────┬───────────────────────────┬─────────────────┘
                │ 直连（MySQL）             │ 直连（PG）
┌───────────────▼───────────┐   ┌──────────▼─────────────────┐
│  MySQL（业务数据）         │   │  PostgreSQL + pgvector     │
│ user/project/paper/...    │   │  paper_chunk 向量存储       │
└───────────────────────────┘   └────────────────────────────┘
```

- **数据库层**：`docker compose up -d` 起 postgres + mysql，DSH bundle 直连（`scripts/dsh-gateway.sh` 注入连接信息）。
- **数据持久化**：两个 named volume（`pgdata`、`mysqldata`），删容器不丢数据。
- **文件存储**：论文 PDF 落 `~/.researchos/uploads`（research-file bundle，非容器内）。

## 相关文档

- [Implementation/90-config-deploy.md](../Implementation/90-config-deploy.md) - 环境变量与部署配置规范
- [Implementation/40-database.md](../Implementation/40-database.md) - 数据库 schema 与迁移
- [CLAUDE.md](../CLAUDE.md) - 编码规范
