-- V3: 手稿表（Writing 工作区保存）
-- date: 2026-08-16
-- dev: myf

CREATE TABLE IF NOT EXISTS manuscript (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    project_id  BIGINT COMMENT '关联项目（可选）',
    title       VARCHAR(255) NOT NULL,
    format      VARCHAR(20) DEFAULT 'latex' COMMENT 'markdown | latex',
    content     MEDIUMTEXT COMMENT '手稿内容（.tex / .md 源码）',
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_manuscript_user (user_id),
    INDEX idx_manuscript_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;