-- V1: 初始化核心表结构
-- 对应 Implementation/40-database.md

CREATE EXTENSION IF NOT EXISTS vector;

-- 用户
CREATE TABLE app_user (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password      VARCHAR(255),
    oauth_provider VARCHAR(32),
    oauth_id      VARCHAR(255),
    plan          VARCHAR(32) DEFAULT 'FREE',
    created_time  TIMESTAMPTZ DEFAULT now()
);

-- 研究项目
CREATE TABLE research_project (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    domain       VARCHAR(255),
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_project_user ON research_project(user_id);

-- 论文
CREATE TABLE paper (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT NOT NULL REFERENCES research_project(id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    title        TEXT,
    authors      TEXT,
    year         INT,
    doi          VARCHAR(255),
    pdf_url      TEXT NOT NULL,
    summary      JSONB,
    status       VARCHAR(32) DEFAULT 'UPLOADED',
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_paper_project ON paper(project_id);
CREATE INDEX idx_paper_user    ON paper(user_id);

-- 论文分块（向量，由 ai-service 写入）
CREATE TABLE paper_chunk (
    id        BIGSERIAL PRIMARY KEY,
    paper_id  BIGINT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    section   VARCHAR(64),
    content   TEXT,
    embedding vector(1536)
);
CREATE INDEX idx_chunk_paper   ON paper_chunk(paper_id);
CREATE INDEX idx_chunk_section ON paper_chunk(section);
CREATE INDEX idx_chunk_embedding ON paper_chunk
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 聊天历史
CREATE TABLE conversation (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    paper_id     BIGINT REFERENCES paper(id) ON DELETE CASCADE,
    question     TEXT,
    answer       TEXT,
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_conv_paper ON conversation(paper_id);

-- AI 任务
CREATE TABLE ai_task (
    task_id      BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type         VARCHAR(64),
    status       VARCHAR(32) DEFAULT 'PENDING',
    result       JSONB,
    error        TEXT,
    created_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_task_user ON ai_task(user_id);
