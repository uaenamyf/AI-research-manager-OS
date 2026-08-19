-- V1: MySQL 初始化核心表结构（由 PostgreSQL 版 V1-V4 合并迁移而来）
-- 迁移说明：
--   BIGSERIAL        -> BIGINT AUTO_INCREMENT
--   TIMESTAMPTZ      -> DATETIME(6)（存本地时间，JDBC serverTimezone=Asia/Shanghai）
--   JSONB            -> JSON（MySQL 8.0 原生）
--   外键命名统一 fk_<子表>_<父表>，索引命名 idx_<表>_<列>
--
-- 双库架构：业务数据（本文件全部表）在 MySQL；
-- AI 向量数据 paper_chunk 保留在 PostgreSQL 向量库（pgvector），
-- 由 ai-service 独占读写，paper_id 为跨库逻辑关联（无外键约束）。

-- 用户
CREATE TABLE app_user (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    email          VARCHAR(255) UNIQUE NOT NULL,
    password       VARCHAR(255),
    oauth_provider VARCHAR(32),
    oauth_id       VARCHAR(255),
    plan           VARCHAR(32) DEFAULT 'FREE',
    settings       JSON NOT NULL,
    created_time   DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 研究项目
CREATE TABLE research_project (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    domain       VARCHAR(255),
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_project_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    KEY idx_project_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 文件夹（原 V2）
CREATE TABLE folder (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    parent_id  BIGINT,
    name       VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_folder_project FOREIGN KEY (project_id) REFERENCES research_project (id) ON DELETE CASCADE,
    CONSTRAINT fk_folder_parent FOREIGN KEY (parent_id) REFERENCES folder (id) ON DELETE SET NULL,
    UNIQUE KEY uk_folder (project_id, parent_id, name),
    KEY idx_folder_user (user_id),
    KEY idx_folder_project (project_id),
    KEY idx_folder_parent (parent_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 论文（含 folder_id，原 V2）
CREATE TABLE paper (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    folder_id    BIGINT,
    title        TEXT,
    authors      TEXT,
    year         INT,
    doi          VARCHAR(255),
    pdf_url      TEXT NOT NULL,
    summary      JSON,
    status       VARCHAR(32) DEFAULT 'UPLOADED',
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_paper_project FOREIGN KEY (project_id) REFERENCES research_project (id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_folder FOREIGN KEY (folder_id) REFERENCES folder (id) ON DELETE SET NULL,
    KEY idx_paper_project (project_id),
    KEY idx_paper_user (user_id),
    KEY idx_paper_folder (folder_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- AI 任务
CREATE TABLE ai_task (
    task_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    type         VARCHAR(64),
    status       VARCHAR(32) DEFAULT 'PENDING',
    result       JSON,
    error        TEXT,
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    KEY idx_task_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
