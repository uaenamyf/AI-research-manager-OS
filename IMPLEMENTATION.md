# ResearchOS AI — 具体实现方案

> 本文基于 `plan.md` 的产品规划，给出落地到代码层面的具体实现方案：模块划分、目录结构、关键接口契约、数据流、技术实现要点。
>
> 定位：**面向单一开发者的 8–12 周 MVP**，技术栈 Next.js + Spring Boot + Python FastAPI。

---

## 目录

1. [仓库结构（monorepo）](#1-仓库结构monorepo)
2. [技术栈与版本锁定](#2-技术栈与版本锁定)
3. [Feature → 模块映射](#3-feature--模块映射)
4. [前端实现（Next.js）](#4-前端实现nextjs)
5. [后端实现（Spring Boot）](#5-后端实现spring-boot)
6. [AI 服务实现（FastAPI）](#6-ai-服务实现fastapi)
7. [数据库 schema 与迁移](#7-数据库-schema-与迁移)
8. [关键 API 契约](#8-关键-api-契约)
9. [核心 AI 流程实现](#9-核心-ai-流程实现)
10. [RAG 实现细节](#10-rag-实现细节)
11. [异步任务流](#11-异步任务流)
12. [认证与多租户隔离](#12-认证与多租户隔离)
13. [环境变量与配置](#13-环境变量与配置)
14. [本地开发与 Docker](#14-本地开发与-docker)
15. [测试策略](#15-测试策略)
16. [里程碑任务拆解](#16-里程碑任务拆解)

---

# 1. 仓库结构（monorepo）

```
ai-research-os/
├── frontend/                 # Next.js 15 应用
├── backend/                  # Spring Boot 3 (Java 21)
├── ai-service/               # FastAPI Python 服务
├── infra/                    # docker-compose、部署脚本
│   └── docker-compose.yml
├── docs/                     # 架构文档、API 文档
├── plan.md                   # 产品规划（只读参考）
├── IMPLEMENTATION.md         # 本文件
├── CLAUDE.md                 # 项目编码规范（Claude Code 用）
├── AGENTS.md                 # 多 agent 协作规范
└── README.md
```

**各服务职责边界（严格遵守，避免越界）：**

| 服务 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| frontend | UI 渲染、状态管理、调用 backend API | 直接访问数据库、直接调用 ai-service |
| backend | 业务逻辑、用户/权限/订阅、文件上传编排、任务下发 | 实现 AI/LLM 逻辑、向量计算 |
| ai-service | PDF 解析、LLM 调用、RAG、Agent 工作流 | 持久化业务数据（结果回传 backend） |

> **铁律**：frontend 只与 backend 通信；backend 通过 RabbitMQ/HTTP 与 ai-service 通信。frontend 永远不直连 ai-service。

---

# 2. 技术栈与版本锁定

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 前端 | Next.js + React | 15.x |
| 前端语言 | TypeScript | 5.x |
| UI | Tailwind CSS + shadcn/ui | latest |
| 后端 | Spring Boot | 3.3.x |
| 后端语言 | Java | 21 LTS |
| ORM | MyBatis-Plus | 3.5.x |
| 安全 | Spring Security + JWT | 6.x |
| 数据库 | PostgreSQL | 16 |
| 向量库 | pgvector 扩展 | 0.7.x |
| 缓存 | Redis | 7.x |
| 消息队列 | RabbitMQ | 3.13 |
| AI 服务 | Python + FastAPI | 3.12 / 0.115 |
| Agent | LangGraph | 0.2.x |
| RAG | LlamaIndex | 0.11.x |
| PDF 解析 | PyMuPDF + GROBID（可选） | latest |
| LLM SDK | OpenAI SDK / Anthropic SDK | latest |
| 对象存储 | AWS S3 SDK v2 / Cloudflare R2 | — |

---

# 3. Feature → 模块映射

| Feature | 前端模块 | 后端模块 | ai-service 模块 |
| --- | --- | --- | --- |
| F1 用户账户 | `app/(auth)` | `user`、`auth` | — |
| F2 Project | `app/projects` | `project` | — |
| F3 论文上传 | `app/papers/upload` | `paper`、`file` | `parser/pdf_parser.py` |
| F4 Paper Card | `app/papers/[id]` | `paper` | `agents/paper_agent.py` |
| F5 Paper Chat | `app/papers/[id]/chat` | `chat` | `agents/chat_agent.py` + `rag/` |
| F6 Knowledge Base | `app/knowledge` | `paper`（tag 查询） | — |
| F7 Review Assistant | `app/writing` | `ai-task` | `agents/review_agent.py` |

---

# 4. 前端实现（Next.js）

## 目录结构

```
frontend/
├── src/
│   ├── app/                      # App Router
│   │   ├── (auth)/login          # 路由组（不显示布局）
│   │   ├── (auth)/register
│   │   ├── dashboard/
│   │   ├── projects/[id]/
│   │   ├── papers/[id]/          # Paper Workspace
│   │   │   ├── page.tsx          # PDF + AI 助手双栏
│   │   │   └── chat/             # Paper Chat
│   │   ├── knowledge/
│   │   ├── writing/              # Review Generator
│   │   └── settings/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 组件
│   │   ├── paper/
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── PaperCard.tsx
│   │   │   └── ChatPanel.tsx
│   │   └── layout/
│   ├── lib/
│   │   ├── api/                 # 后端 API 客户端（封装 fetch）
│   │   │   ├── client.ts         # 带拦截器的 baseURL 客户端
│   │   │   ├── papers.ts
│   │   │   └── chat.ts
│   │   ├── hooks/
│   │   └── utils/
│   ├── stores/                   # Zustand 状态
│   └── types/                    # 共享类型（与后端 DTO 对齐）
├── public/
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

## 关键约定

- **数据获取**：Server Components 优先用 fetch + RSC；客户端交互用 TanStack Query。
- **PDF 渲染**：`react-pdf`（基于 pdf.js），支持选中文本高亮。
- **聊天流式**：AI 回复用 Server-Sent Events（SSE），通过 backend 转发 ai-service 的流。
- **认证**：JWT 存 httpOnly cookie，客户端不暴露 token。

## 核心 API 客户端示例

```typescript
// src/lib/api/client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

---

# 5. 后端实现（Spring Boot）

## 目录结构

```
backend/
├── src/main/java/com/researchos/
│   ├── ResearchOsApplication.java
│   ├── config/              # SecurityConfig、RedisConfig、RabbitConfig、CorsConfig
│   ├── common/              # 统一响应、异常处理、分页
│   ├── user/                # entity / mapper / service / controller
│   ├── auth/                # JWT、OAuth、登录注册
│   ├── project/
│   ├── paper/               # paper CRUD
│   ├── file/                # S3 上传、signed URL
│   ├── aitask/              # AI 任务下发与回调
│   ├── chat/                # Paper Chat（转发 ai-service，SSE）
│   └── subscription/        # Stripe、额度校验
├── src/main/resources/
│   ├── application.yml
│   ├── mapper/              # MyBatis XML
│   └── db/migration/        # Flyway 迁移脚本 V1__init.sql
└── pom.xml
```

## 模块分层约定（每个业务模块统一）

```
xxx/
├── controller/   # REST 端点，只做参数校验与调度
├── service/       # 业务逻辑
├── mapper/        # MyBatis-Plus 数据访问
├── entity/        # 数据库实体
└── dto/           # 请求/响应 DTO
```

## 关键组件

### 统一响应

```java
public record ApiResponse<T>(int code, String message, T data) {
    public static <T> ApiResponse<T> ok(T data) { return new ApiResponse<>(0, "ok", data); }
    public static <T> ApiResponse<T> fail(int code, String msg) { return new ApiResponse<>(code, msg, null); }
}
```

### 全局异常处理

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) { ... }
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleDenied(AccessDeniedException e) { ... }
}
```

### AI 任务下发（异步）

```java
// backend 发消息到 RabbitMQ exchange=researchos.ai.task
public void dispatchPaperAnalysis(Long paperId) {
    rabbitTemplate.convertAndSend("researchos.ai.task", "paper.analyze",
        new AiTaskMessage(paperId, "PAPER_ANALYSIS"));
}
```

### Paper Chat SSE 转发

```java
@GetMapping(value = "/papers/{id}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter chatStream(@PathVariable Long id, @RequestParam String q) {
    SseEmitter emitter = new SseEmitter(60_000L);
    // 调用 ai-service 的 /rag/chat/stream，转发 token
    chatService.forwardStream(id, q, emitter);
    return emitter;
}
```

---

# 6. AI 服务实现（FastAPI）

## 目录结构

```
ai-service/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── api/
│   │   ├── routes/
│   │   │   ├── paper.py     # POST /paper/analyze
│   │   │   ├── chat.py      # POST /rag/chat/stream (SSE)
│   │   │   └── review.py    # POST /review/generate
│   ├── agents/
│   │   ├── paper_agent.py
│   │   ├── chat_agent.py
│   │   ├── review_agent.py
│   │   └── writing_agent.py
│   ├── rag/
│   │   ├── retriever.py     # 检索器（section-aware）
│   │   ├── vector_store.py   # pgvector 操作
│   │   └── embedding.py      # OpenAI embedding
│   ├── parser/
│   │   └── pdf_parser.py     # PyMuPDF + section 切分
│   ├── llm/
│   │   └── client.py         # 统一 LLM 客户端
│   ├── worker/
│   │   └── consumer.py       # RabbitMQ 消费者（异步任务）
│   ├── core/
│   │   ├── config.py         # Settings（pydantic-settings）
│   │   ├── deps.py           # 依赖注入
│   │   └── security.py       # 内部服务鉴权
│   └── models/              # Pydantic schema
├── tests/
├── pyproject.toml
└── Dockerfile
```

## 健康检查与路由

```python
# app/main.py
app = FastAPI(title="ResearchOS AI Service")

@app.get("/health")
def health(): return {"status": "ok"}

app.include_router(paper_router,   prefix="/paper", tags=["paper"])
app.include_router(chat_router,    prefix="/rag",   tags=["rag"])
app.include_router(review_router,  prefix="/review", tags=["review"])
```

## 内部鉴权（backend → ai-service）

ai-service 只接受 backend 的调用，用共享密钥校验：

```python
# app/core/security.py
async def verify_internal_token(x_internal_token: str = Header(...)):
    if x_internal_token != settings.INTERNAL_TOKEN:
        raise HTTPException(401, "unauthorized internal call")
```

---

# 7. 数据库 schema 与迁移

使用 Flyway 管理。PostgreSQL 16 + pgvector 扩展。

## V1__init.sql（核心表）

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- 用户
CREATE TABLE app_user (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(255) UNIQUE NOT NULL,
    password     VARCHAR(255),          -- OAuth 用户可为空
    oauth_provider VARCHAR(32),
    oauth_id     VARCHAR(255),
    plan         VARCHAR(32) DEFAULT 'FREE',
    created_time TIMESTAMPTZ DEFAULT now()
);

-- 研究项目
CREATE TABLE research_project (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    domain      VARCHAR(255),
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_project_user ON research_project(user_id);

-- 论文
CREATE TABLE paper (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES research_project(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    title       TEXT,
    authors     TEXT,
    year        INT,
    doi         VARCHAR(255),
    pdf_url     TEXT NOT NULL,
    summary     JSONB,                -- Paper Intelligence Card
    status      VARCHAR(32) DEFAULT 'UPLOADED',  -- UPLOADED/PROCESSING/ANALYZED/READY/FAILED
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_paper_project ON paper(project_id);
CREATE INDEX idx_paper_user    ON paper(user_id);

-- 论文分块（向量）
CREATE TABLE paper_chunk (
    id         BIGSERIAL PRIMARY KEY,
    paper_id   BIGINT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    section    VARCHAR(64),           -- abstract/intro/methods/results/discussion/references
    content    TEXT,
    embedding  vector(1536)
);
CREATE INDEX idx_chunk_paper ON paper_chunk(paper_id);
CREATE INDEX idx_chunk_section ON paper_chunk(section);
-- 向量检索索引（IVFFLAT）
CREATE INDEX idx_chunk_embedding ON paper_chunk
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 聊天历史
CREATE TABLE conversation (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    paper_id    BIGINT REFERENCES paper(id) ON DELETE CASCADE,
    question    TEXT,
    answer      TEXT,
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_conv_paper ON conversation(paper_id);

-- AI 任务
CREATE TABLE ai_task (
    task_id      BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type         VARCHAR(64),         -- PAPER_ANALYSIS / REVIEW_GENERATION
    status       VARCHAR(32) DEFAULT 'PENDING',  -- PENDING/PROCESSING/SUCCESS/FAILED
    result       JSONB,
    error        TEXT,
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_task_user ON ai_task(user_id);
```

## 关键设计点

- **summary 存 JSONB**：Paper Intelligence Card 的结构化字段（method/finding/limitation...）存 JSON，便于灵活扩展，前端直接渲染。
- **paper_chunk.section**：RAG 按论文结构切分的关键，检索时可按 section 过滤。
- **所有业务表带 user_id**：多租户隔离的物理基础（即使能从 project 推导，也冗余存 user_id 加速鉴权查询）。

---

# 8. 关键 API 契约

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 邮箱注册 |
| POST | `/api/auth/login` | 登录，返回 JWT（httpOnly cookie） |
| GET | `/api/auth/oauth/google` | Google OAuth 重定向 |

## Project

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects` | 列表 |
| GET | `/api/projects/{id}` | 详情 |

## Paper

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects/{id}/papers` | 上传 PDF（multipart），返回 paperId |
| GET | `/api/papers/{id}` | 详情（含 Paper Card） |
| GET | `/api/projects/{id}/papers` | 项目下论文列表 |
| GET | `/api/papers/{id}/status` | 轮询分析状态（或 SSE） |

## Chat

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/papers/{id}/chat` | 提问（非流式） |
| GET | `/api/papers/{id}/chat/stream?q=` | 流式问答（SSE） |

## Review

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/review/generate` | body: `{paperIds:[], topic:""}`，返回 taskId |
| GET | `/api/review/{taskId}` | 轮询结果（返回 Markdown） |

## Paper 上传响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "paperId": 1024,
    "status": "PROCESSING"
  }
}
```

---

# 9. 核心 AI 流程实现

## 9.1 上传论文 → AI 分析（异步）

```
[Frontend] 上传 PDF
    ↓ multipart
[Backend] paper 模块
    ├── 1. 校验额度（subscription）
    ├── 2. 上传 S3，得到 pdf_url
    ├── 3. 写 paper 记录 status=UPLOADED
    ├── 4. 发 MQ 消息 {paperId, type:PAPER_ANALYSIS}
    └── 5. 返回 {paperId, status:PROCESSING}
    ↓
[RabbitMQ] researchos.ai.task
    ↓
[ai-service worker] consumer.py
    ├── 6. 更新 status=PROCESSING
    ├── 7. pdf_parser 解析 + section 切分
    ├── 8. embedding -> pgvector
    ├── 9. paper_agent 生成 Paper Intelligence Card
    └── 10. 回调 backend PATCH /internal/paper/{id}/result {summary, status:READY}
    ↓
[Backend] 更新 paper.summary + status=READY
    ↓
[Frontend] 轮询 /papers/{id}/status 或 SSE 通知
```

## 9.2 Paper Chat（同步 SSE）

```
[Frontend] GET /papers/{id}/chat/stream?q=Why+CNN
    ↓
[Backend] chat 模块
    ├── 鉴权 + 额度
    └── 转发 ai-service POST /rag/chat/stream (SSE)
    ↓
[ai-service] chat_agent
    ├── retriever 检索 paper_chunk（带 paper_id 过滤）
    ├── 构造 prompt：context + question
    └── LLM stream -> 逐 token SSE 返回
    ↓
[Backend] 透传 SSE -> [Frontend]
```

## 9.3 Literature Review 生成（异步）

```
[Frontend] POST /review/generate {paperIds, topic}
    ↓
[Backend] ai-task
    ├── 创建 ai_task status=PENDING
    ├── 发 MQ {taskId, paperIds, topic, type:REVIEW_GENERATION}
    └── 返回 taskId
    ↓
[ai-service] review_agent
    ├── retriever 批量检索相关 chunk
    ├── 按 methods/limitations 分组
    ├── LLM 生成综述 + 插入引用
    └── 回调 backend PATCH /internal/task/{id}/result {markdown}
    ↓
[Backend] 更新 task.result + status=SUCCESS
    ↓
[Frontend] 轮询 /review/{taskId}
```

---

# 10. RAG 实现细节

## Section-aware 切分

```python
# app/parser/pdf_parser.py
SECTION_PATTERNS = {
    "abstract": r"abstract",
    "introduction": r"^\d?\.?\s*introduction",
    "methods": r"^\d?\.?\s*(methods?|materials and methods)",
    "results": r"^\d?\.?\s*results",
    "discussion": r"^\d?\.?\s*discussion",
    "references": r"^\d?\.?\s*references",
}

def parse_and_chunk(pdf_bytes: bytes) -> list[Chunk]:
    text = extract_text(pdf_bytes)          # PyMuPDF
    sections = split_by_section(text)      # 按正则匹配章节标题
    chunks = []
    for section, content in sections.items():
        for piece in sliding_window(content, size=512, overlap=64):
            chunks.append(Chunk(section=section, content=piece))
    return chunks
```

## 检索策略

```python
# app/rag/retriever.py
async def retrieve(paper_id: int, query: str, top_k: int = 5) -> list[Chunk]:
    q_emb = await embed(query)
    # 1. 向量相似度（cosine）
    # 2. 限定 paper_id（单论文问答）或不限定（跨论文综述）
    # 3. section 加权：methods section 权重 ×1.5
    rows = await pool.fetch("""
        SELECT id, section, content,
               1 - (embedding <=> $1) AS score
        FROM paper_chunk
        WHERE paper_id = $2
        ORDER BY embedding <=> $1
        LIMIT $3
    """, q_emb, paper_id, top_k)
    return rows
```

## Prompt 模板

```
You are a research assistant. Answer based ONLY on the provided paper context.
If the answer is not in the context, say "This is not mentioned in the paper."

[CONTEXT]
{retrieved_chunks}

[QUESTION]
{user_question}
```

---

# 11. 异步任务流

## RabbitMQ 拓扑

```
Exchange: researchos.ai.task (direct)
  ├─ queue: q.paper.analyze    routing: paper.analyze
  └─ queue: q.review.generate  routing: review.generate

Exchange: researchos.ai.callback (direct)
  └─ queue: q.backend.callback  routing: task.callback
```

## 消息格式（JSON）

```json
{
  "taskId": 123,
  "type": "PAPER_ANALYSIS",
  "payload": { "paperId": 1024 }
}
```

## 重试与死信

- 消费失败重试 3 次（指数退避）。
- 超过重试次数进 DLQ `q.paper.analyze.dlq`，backend 监听 DLQ 更新 task.status=FAILED。

---

# 12. 认证与多租户隔离

## JWT

- Access Token：30min，Payload `{uid, email, plan}`。
- Refresh Token：7 天，存 Redis。
- 前端通过 httpOnly cookie 携带，backend 过滤器解析。

## 数据隔离（强制）

**所有数据查询必须带 user_id 过滤**，在 service 层强制：

```java
// PaperService
public Paper getPaper(Long paperId, Long userId) {
    return paperMapper.selectByIdAndUser(paperId, userId)
        .orElseThrow(() -> new AccessDeniedException("paper not found"));
}
```

**MyBatis-Plus 全局拦截器**：可选注入 tenant_id 防漏。

## 文件安全

- S3/R2 bucket 设为私有，不公开读。
- 访问 PDF 通过 backend 签发 **Signed URL**（有效期 15min）。
- 上传用 **Pre-signed POST**，前端直传 S3，backend 不中转文件流。

---

# 13. 环境变量与配置

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

---

# 14. 本地开发与 Docker

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

---

# 15. 测试策略

| 层 | 工具 | 范围 |
| --- | --- | --- |
| 前端 | Vitest + React Testing Library | 组件单元、hook |
| 前端 E2E | Playwright | 关键用户流程 |
| 后端 | JUnit 5 + Mockito | service 单元、controller MockMvc |
| 后端集成 | Testcontainers（PG/Redis/Rabbit） | repository、MQ 消费 |
| ai-service | pytest + httpx | API、agent 逻辑（mock LLM） |
| LLM 回归 | 录制 fixture，离线对比 | 防止 prompt 改动劣化 |

**ai-service 测试要点**：LLM 调用必须可 mock，CI 不消耗真实 token；用 fixture 固化 PDF 解析与检索结果。

---

# 16. 里程碑任务拆解

## Sprint 1（2 周）基础平台

| # | 任务 | 服务 |
| --- | --- | --- |
| 1.1 | 仓库初始化 + docker-compose 跑通 | infra |
| 1.2 | Flyway V1 建表 + pgvector 扩展 | backend |
| 1.3 | Spring Security + JWT 注册登录 | backend |
| 1.4 | Google OAuth 登录 | backend |
| 1.5 | Project CRUD | backend |
| 1.6 | 前端登录/注册页 + dashboard 骨架 | frontend |
| 1.7 | S3/R2 上传 + signed URL | backend |

## Sprint 2（3 周）AI 核心能力

| # | 任务 | 服务 |
| --- | --- | --- |
| 2.1 | FastAPI 骨架 + 健康检查 + 内部鉴权 | ai-service |
| 2.2 | RabbitMQ 消费者 + 任务回调 | ai-service |
| 2.3 | PDF 解析 + section 切分 | ai-service |
| 2.4 | embedding + pgvector 存储 | ai-service |
| 2.5 | paper_agent 生成 Paper Card | ai-service |
| 2.6 | 上传 → 分析异步链路联调 | 全栈 |
| 2.7 | 前端 Paper Workspace（PDF + Card） | frontend |
| 2.8 | Paper Chat SSE 链路 | 全栈 |
| 2.9 | RAG 检索 + prompt | ai-service |

## Sprint 3（3 周）商业化能力

| # | 任务 | 服务 |
| --- | --- | --- |
| 3.1 | review_agent 综述生成 | ai-service |
| 3.2 | Knowledge Base（tag + 搜索） | backend |
| 3.3 | 前端 Review Generator 页面 | frontend |
| 3.4 | Stripe 订阅 + 额度拦截 | backend |
| 3.5 | 免费档位限制（10 papers/month） | backend |
| 3.6 | Dashboard 优化（统计卡片） | frontend |
| 3.7 | E2E 测试 + 部署脚本 | 全栈 |

---

> 本实现方案与 `plan.md` 一一对应：Feature 1-7 覆盖全部产品功能，Sprint 1-3 对应开发计划，架构图的服务边界在此细化为 API 契约与数据流。
