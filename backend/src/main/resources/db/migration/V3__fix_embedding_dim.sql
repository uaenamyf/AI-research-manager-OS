-- V3: embedding 维度对齐 doubao-embedding-vision（火山引擎，2048 维）
-- date: 2026-08-06
-- dev: myf
--
-- 背景：.env 中 EMBEDDING_MODEL=doubao-embedding-vision（输出 2048 维），
-- 与 V1 表定义 vector(2048) 一致。本迁移重建 embedding 列确保维度一致。
--
-- 注意：
-- 1. drop + add 会清空已有向量数据（content/section 保留），
--    由 ai-service 重新生成 embedding 后回填。
-- 2. 不建 ivfflat/hnsw 向量索引：pgvector 索引限 2000 维，2048 维超限。
--    小数据集下全表扫描即可；未来若换 1536 维模型可补建。

ALTER TABLE paper_chunk DROP COLUMN IF EXISTS embedding;
ALTER TABLE paper_chunk ADD COLUMN embedding vector(2048);
