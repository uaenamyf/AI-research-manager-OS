-- V3: embedding 维度 2048 -> 1536（对齐 text-embedding-3-small 实际输出）
-- date: 2026-08-06
-- dev: myf

-- 1. 变更向量列维度。pgvector 支持 vector(n) -> vector(m) cast，
--    1536 < 2048 只缩不减，用 USING 显式截断（安全降维）。
ALTER TABLE paper_chunk ALTER COLUMN embedding TYPE vector(1536)
    USING embedding::vector(1536);

-- 2. 1536 < 2000，现在可以建 ivfflat 向量索引（小数据集 lists=100）。
CREATE INDEX idx_chunk_embedding ON paper_chunk
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
