-- 用户级配置（LLM / 翻译 / Knowledge 等偏好）
-- 2026-08-12 myf: 新增 settings JSONB 字段，支持用户自定义 API Key、模型、翻译服务等

ALTER TABLE app_user
    ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN app_user.settings IS '用户级配置 JSON：llm / translation / knowledge 等偏好';
