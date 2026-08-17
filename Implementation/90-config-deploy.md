# 90 - 环境变量与部署

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

## docker-compose.yml

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

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ["3000:3000"]
    depends_on: [backend]

volumes:
  mysqldata:
  pgdata:
```

## 本地启动顺序

```bash
docker compose up -d postgres redis rabbitmq
docker compose up backend ai-service frontend
```

## 云部署

推荐 AWS：`EC2 + RDS PostgreSQL + S3 + CloudFront`

或更便宜：`DigitalOcean + Cloudflare R2`
