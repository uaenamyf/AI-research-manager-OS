-- V2: 阅读状态/星级评分
-- date: 2026-08-15
-- dev: myf

-- 阅读状态和星级评分（Phase 5）
ALTER TABLE paper ADD COLUMN IF NOT EXISTS reading_status VARCHAR(20) DEFAULT 'unread'
    COMMENT 'unread | reading | done';
ALTER TABLE paper ADD COLUMN IF NOT EXISTS star_rating TINYINT DEFAULT NULL
    COMMENT '1-5 星级评分';