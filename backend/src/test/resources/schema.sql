-- H2 测试数据库 Schema
-- 自动创建：在测试启动时 Spring Boot 自动执行

CREATE TABLE IF NOT EXISTS app_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    plan VARCHAR(20) DEFAULT 'FREE',
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_project (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    domain VARCHAR(100),
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    title VARCHAR(500),
    authors TEXT,
    "year" INT,
    doi VARCHAR(255),
    pdf_url VARCHAR(1000),
    status VARCHAR(50) DEFAULT 'UPLOADED',
    summary JSON,  -- H2 JSON 支持
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    paper_id BIGINT,
    conversation_id BIGINT,
    user_id BIGINT,
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'PENDING',
    result JSON,
    error TEXT,
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    paper_id BIGINT,
    title VARCHAR(255),
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
