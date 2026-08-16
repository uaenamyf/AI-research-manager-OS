-- V2: 批注表 + 阅读状态/星级评分
-- date: 2026-08-15
-- dev: myf

-- 论文批注表（Phase 3）
CREATE TABLE IF NOT EXISTS annotation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    paper_id    BIGINT NOT NULL,
    user_id     BIGINT NOT NULL,
    page_num    INT NOT NULL COMMENT 'PDF 页码（0-based）',
    x           DOUBLE COMMENT '选区左上角 x（相对 PDF 页面宽度的比例 0-1）',
    y           DOUBLE COMMENT '选区左上角 y',
    width       DOUBLE COMMENT '选区宽度',
    height      DOUBLE COMMENT '选区高度',
    text        TEXT COMMENT '选中的文本内容',
    note        TEXT COMMENT '用户笔记',
    color       VARCHAR(20) DEFAULT '#FFEB3B' COMMENT '高亮颜色',
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_annotation_paper (paper_id),
    INDEX idx_annotation_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 阅读状态和星级评分（Phase 5）
ALTER TABLE paper ADD COLUMN IF NOT EXISTS reading_status VARCHAR(20) DEFAULT 'unread'
    COMMENT 'unread | reading | done';
ALTER TABLE paper ADD COLUMN IF NOT EXISTS star_rating TINYINT DEFAULT NULL
    COMMENT '1-5 星级评分';