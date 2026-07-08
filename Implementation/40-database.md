# 40 - 数据库 schema 与迁移

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
- **向量维度 1536**：对应 `text-embedding-3-small`，如换 embedding 模型需同步改维度并重建索引。
- **ivfflat lists=100**：小数据集可调，需在插入足够数据后建索引才有效。
