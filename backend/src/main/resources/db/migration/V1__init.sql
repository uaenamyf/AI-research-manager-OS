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
    embedding vector(2048)
);
CREATE INDEX idx_chunk_paper   ON paper_chunk(paper_id);
CREATE INDEX idx_chunk_section ON paper_chunk(section);
-- 注：vector(2048) 超过 ivfflat/hnsw 索引的 2000 维限制，
-- MVP 阶段用 paper_id 过滤 + ORDER BY 全表扫描，数据量小时性能可接受。
-- 如需向量索引，可换用 1536 维 embedding 模型（如 text-embedding-3-small）。

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
