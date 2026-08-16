-- V6: 全文搜索（pg_trgm 索引）+ 阅读状态/星级
-- date: 2026-08-15
-- dev: myf

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- paper_chunk 内容全文搜索索引
CREATE INDEX IF NOT EXISTS idx_chunk_content_trgm ON paper_chunk USING gin (content gin_trgm_ops);