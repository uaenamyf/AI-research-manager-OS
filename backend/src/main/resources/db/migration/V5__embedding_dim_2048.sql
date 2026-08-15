-- V5: 适配 doubao-embedding-vision（2048 维）
-- date: 2026-08-15
-- dev: myf
--
-- 背景：切换嵌入模型为 doubao-embedding-vision（火山引擎/OpenAI 兼容代理），
-- 输出维度从 1536 变为 2048，需同步扩展 paper_chunk.embedding 列。
-- 当前无有效数据（此前所有论文分析因 OpenAI 不可达均 FAILED），可直接 ALTER。

ALTER TABLE paper_chunk ALTER COLUMN embedding TYPE vector(2048);