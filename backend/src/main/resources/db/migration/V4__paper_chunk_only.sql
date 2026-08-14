-- V4: 双库架构下 PG 侧仅保留 paper_chunk（向量表）
-- date: 2026-08-15
-- dev: myf
--
-- 背景：业务表（app_user/research_project/paper/conversation/ai_task/folder）
-- 已迁至 MySQL（见 db/migration-mysql/V1__init.sql），PostgreSQL 只承载 AI 向量。
--
-- 注意：
-- 1. paper_id 是跨库逻辑外键（MySQL paper.id），PG 侧无物理外键、无 CASCADE，
--    删除论文时由 backend 发 MQ paper.delete -> ai-service 执行 DELETE 清理（最终一致）。
-- 2. embedding 维度须与 EMBEDDING_DIM 对齐：当前 .env 为 1536（text-embedding-3-small）；
--    若换 doubao-embedding-vision（2048 维），需同步修改本表。
-- 3. Flyway 已禁用，本脚本手动执行（参考 docker compose 的 mysql init 机制）。

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS paper_chunk (
    id        BIGSERIAL PRIMARY KEY,
    paper_id  BIGINT NOT NULL,
    section   VARCHAR(64),
    content   TEXT,
    embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS idx_chunk_paper   ON paper_chunk(paper_id);
CREATE INDEX IF NOT EXISTS idx_chunk_section ON paper_chunk(section);
