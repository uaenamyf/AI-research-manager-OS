# 90 - 环境变量与部署

## backend `application.yml`

```yaml
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:5432/researchos
    username: ${DB_USER}
    password: ${DB_PASS}
  data:
    redis:
      host: ${REDIS_HOST:localhost}
  rabbitmq:
    host: ${RABBIT_HOST:localhost}

app:
  jwt:
    secret: ${JWT_SECRET}
    access-ttl: 30m
    refresh-ttl: 7d
  storage:
    type: ${STORAGE_TYPE:s3}     # s3 | r2
    bucket: ${STORAGE_BUCKET}
    region: ${STORAGE_REGION}
    access-key: ${STORAGE_KEY}
    secret-key: ${STORAGE_SECRET}
  ai-service:
    base-url: http://ai-service:8000
    internal-token: ${INTERNAL_TOKEN}
  oauth:
    google:
      client-id: ${GOOGLE_CLIENT_ID}
      client-secret: ${GOOGLE_CLIENT_SECRET}
```

## ai-service `.env`

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/researchos
REDIS_URL=redis://redis:6379/0
RABBITMQ_URL=amqp://rabbitmq:5672
INTERNAL_TOKEN=<同 backend>
LLM_PROVIDER=openai          # openai | anthropic
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
```

## docker-compose.yml

```yaml
services:
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
      DB_HOST: postgres
      REDIS_HOST: redis
      RABBIT_HOST: rabbitmq
    ports: ["8080:8080"]
    depends_on: [postgres, redis, rabbitmq]

  ai-service:
    build: ./ai-service
    environment:
      DATABASE_URL: postgresql+asyncpg://researchos:researchos@postgres:5432/researchos
      RABBITMQ_URL: amqp://rabbitmq:5672
    ports: ["8000:8000"]
    depends_on: [postgres, rabbitmq]

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ["3000:3000"]
    depends_on: [backend]

volumes:
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
