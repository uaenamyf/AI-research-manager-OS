# 90 - 环境变量与部署

## 融合现状（2026-08-18）

> DSH 单实例常驻 `127.0.0.1:3080`（GUI + 统一 LLM 网关 + research bundles 同驻一进程），
> 旧 Next.js 前端已移除（2026-08-19 删 `frontend/`）；backend / ai-service 保留运行（双认证 + MQ 管道）。**本节为当前部署形态**，
> 下方各节为 legacy 描述，保留作历史对照。

### dsh-gateway.sh（DSH 常驻启动脚本，新增）

`dsh-plugins/scripts/dsh-gateway.sh` 启动/停止 DSH 单实例（web profile + 统一网关）：

```sh
./dsh-plugins/scripts/dsh-gateway.sh start [port]   # 默认 3080，被占自动后移（bump）
./dsh-plugins/scripts/dsh-gateway.sh status
./dsh-plugins/scripts/dsh-gateway.sh stop
```

- **自动注入 `.env` 环境**：网关 key/模型（`RESEARCH_LLM_API_KEY` / `RESEARCH_LLM_BASE_URL`（取
  `RESEARCH_LLM_UPSTREAM_BASE_URL`，未设回退 `OPENAI_BASE_URL`）/ `RESEARCH_LLM_MODEL` /
  `RESEARCH_EMBEDDING_*`）、`JWT_SECRET`、`RESEARCH_MYSQL_*`、`RESEARCH_RABBITMQ_URL`、
  `RESEARCH_INTERNAL_TOKEN` / `RESEARCH_STORAGE_LOCAL_DIR` / `RESEARCH_BACKEND_URL`、
  `RESEARCH_STRIPE_*` / `RESEARCH_FRONTEND_BASE_URL`；端口 bump 后再导出
  `RESEARCH_GATEWAY_URL`（指向实际端口，供 MCP vector_search 等子进程使用）。
- 启动后统一网关即 `http://127.0.0.1:<port>/v1/chat/completions` 与 `/v1/embeddings`。

### 端口现状（2026-08-18）

| 端口 | 服务 | 状态 |
| --- | --- | --- |
| 3080 | DSH GUI + 统一 LLM 网关 + research bundles（单实例） | ✅ 运行（`dsh-gateway.sh start`） |
| 8080 | backend（Spring Boot） | ✅ 运行（双认证 + MQ 回调） |
| 8000 | ai-service（FastAPI） | ✅ 运行（MQ 消费 + 经网关调 LLM/embedding） |
| 3306 / 5432 | MySQL / PostgreSQL（pgvector） | ✅ 数据服务 |
| 5672 / 15672 | RabbitMQ（AMQP / 管理台） | ✅ 保留（AI 管道迁入 DSH 前不可移除） |
| 6379 | Redis | ⚠️ 未使用（0 key），可随 Phase 5 移除 |

### .env 关键项（融合后）

```env
# ai-service / bundle 统一走 DSH 网关（3080 单实例；host.docker.internal 供容器访问宿主机）
OPENAI_BASE_URL=http://host.docker.internal:3080/v1
EMBEDDING_BASE_URL=http://host.docker.internal:3080/v1
# 网关真实上游（OPENAI_BASE_URL 已指向网关自身，不得再作网关上游，否则自环）
RESEARCH_LLM_UPSTREAM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
# 双认证共享密钥 + 内部调用 token（bundle 经 dsh-gateway.sh 注入同一来源）
JWT_SECRET=...
INTERNAL_TOKEN=...
```

> 变更 `OPENAI_BASE_URL` / `EMBEDDING_BASE_URL` 后需重建 ai-service 容器
> （`docker compose --env-file ../.env --profile app up -d --force-recreate --no-deps ai-service`）。

### 启动顺序（当前）

```bash
# 1) 数据/中间件 + backend + ai-service
cd infra && docker compose --env-file ../.env --profile app up -d mysql postgres rabbitmq
docker compose --env-file ../.env --profile app up -d backend ai-service
# 2) DSH 单实例（GUI + 网关 + bundles）
./dsh-plugins/scripts/dsh-gateway.sh start
```

## backend `application.yml`（节选，业务库为 MySQL）

```yaml
spring:
  datasource:
    url: jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:researchos}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: ${DB_USER:researchos}
    password: ${DB_PASS:researchos}
  data:
    redis:
      host: ${REDIS_HOST:localhost}
  rabbitmq:
    host: ${RABBIT_HOST:localhost}
    port: ${RABBIT_PORT:5672}

app:
  jwt:
    secret: ${JWT_SECRET}
    access-ttl: 7d
    refresh-ttl: 30d
  storage:
    type: ${STORAGE_TYPE:local}    # local | s3（R2 填 endpoint）
    bucket: ${STORAGE_BUCKET}
    region: ${STORAGE_REGION}
    access-key: ${STORAGE_KEY}
    secret-key: ${STORAGE_SECRET}
  ai-service:
    base-url: ${AI_SERVICE_URL:http://localhost:8000}
    internal-token: ${INTERNAL_TOKEN}
  oauth:
    google:
      client-id: ${GOOGLE_CLIENT_ID}
      client-secret: ${GOOGLE_CLIENT_SECRET}
```

## 环境变量统一从仓库根 `.env` 读取

- **唯一入口**：根目录 `.env`（`cp .env.example .env` 后修改），**不要**再维护 `infra/.env` 或 `ai-service/.env`。
- **机制**：Makefile 的 compose 命令带 `--env-file ../.env`（2026-08-15 修复），
  compose 插值 `${VAR}` 与容器 `environment:` 都来自根 `.env`。
- 手动执行等价命令：

```bash
cd infra && docker compose --env-file ../.env --profile app up -d
```

ai-service 容器相关变量（compose 已透传）：

```env
LLM_PROVIDER=openai          # openai | anthropic
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=             # 国内网络走火山引擎/DeepSeek 等 OpenAI 兼容端点时填写
OPENAI_DEFAULT_MODEL=        # 兼容端点时为接入点 ID
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=2048           # 须与 PG paper_chunk.embedding 维度一致
ANTHROPIC_API_KEY=sk-ant-...
```

> ai-service 进程内不再有独立 `.env` 文件；本地直接 `uvicorn app.main:app` 时由
> `app/core/config.py` 的 pydantic-settings 读取 `ai-service/.env`（可选，供本地调试）。

> ⚠️ 过时注（2026-08-18）：`OPENAI_BASE_URL` / `EMBEDDING_BASE_URL` 已正式指向统一网关
> `http://host.docker.internal:3080/v1`（不再是直接上游端点）；真实上游改由
> `RESEARCH_LLM_UPSTREAM_BASE_URL` 承载（见上方「融合现状 · .env 关键项」）。

## docker-compose.yml

> ⚠️ 过时注（2026-08-18）：`frontend` 服务定义已随旧 Next.js 前端移除（2026-08-19 删 `frontend/` 与 compose 服务），
> 当前启动方式见上方「融合现状」。

```yaml
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: researchos
      MYSQL_DATABASE: researchos
      MYSQL_USER: researchos
      MYSQL_PASSWORD: researchos
    ports: ["3306:3306"]
    volumes:
      - mysqldata:/var/lib/mysql

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: researchos
      POSTGRES_USER: researchos
      POSTGRES_PASSWORD: researchos
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  rabbitmq:
    image: rabbitmq:3.13-management
    ports: ["5672:5672", "15672:15672"]

  backend:
    build: ./backend
    environment:
      DB_HOST: mysql
      REDIS_HOST: redis
      RABBIT_HOST: rabbitmq
    ports: ["8080:8080"]
    depends_on: [mysql, redis, rabbitmq]

  ai-service:
    build: ./ai-service
    environment:
      DATABASE_URL: postgresql+asyncpg://researchos:researchos@postgres:5432/researchos
      MYSQL_URL: mysql://researchos:researchos@mysql:3306/researchos
      RABBITMQ_URL: amqp://rabbitmq:5672
    ports: ["8000:8000"]
    depends_on: [postgres, mysql, rabbitmq]

volumes:
  mysqldata:
  pgdata:
```

## 本地启动顺序

```bash
docker compose up -d postgres redis rabbitmq
docker compose up backend ai-service
```

## 云部署

推荐 AWS：`EC2 + RDS PostgreSQL + S3 + CloudFront`

或更便宜：`DigitalOcean + Cloudflare R2`
