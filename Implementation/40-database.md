# 40 - 数据库 schema 与迁移

## 双库架构（最终决定）

**业务数据放 MySQL，AI 向量数据放 PostgreSQL（pgvector）**：

```
MySQL (researchos)                    PostgreSQL (researchos)
├── app_user          业务数据        ├── paper_chunk      AI 向量（pgvector vector(2048)）
├── research_project  backend 维护    └── (旧业务表已迁移后清理，2026-08-13)
├── folder            只被 backend
├── paper             读写
├── conversation
└── ai_task
```

- **MySQL**：backend（Spring Boot + MyBatis-Plus）的唯一数据源，存账号/项目/论文元数据/聊天/任务。
- **PostgreSQL**：ai-service 的向量库，只存 `paper_chunk`（embedding），支撑 RAG 余弦检索。
- **跨库关联**：`paper_chunk.paper_id` 是**逻辑外键**（对应 MySQL `paper.id`），PG 侧无物理外键约束。删除论文时由 backend 发 MQ 通知 ai-service 清理 PG 中的 chunk。

### 连接配置

- backend（`application.yml`）：
  `jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:researchos}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true&rewriteBatchedStatements=true`
  - 驱动 `com.mysql.cj.jdbc.Driver`，用户 `${DB_USER:researchos}`。
- ai-service（`.env`）：
  - `DATABASE_URL=postgresql+asyncpg://researchos:researchos@localhost:5432/researchos`（向量池）
  - `MYSQL_URL=mysql://researchos:researchos@localhost:3306/researchos`（元数据池，只读 paper 等）
- **Flyway 已禁用**（`spring.flyway.enabled: false`）：schema 由 `db/migration-mysql/V1__init.sql` 手工执行，避免与旧 PG 迁移混用。

## MySQL 业务表（db/migration-mysql/V1__init.sql）

```sql
-- 用户
CREATE TABLE app_user (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password       VARCHAR(255),             -- BCrypt；OAuth 用户可为空
    oauth_provider VARCHAR(32),
    oauth_id       VARCHAR(255),
    plan           VARCHAR(32) DEFAULT 'FREE',
    settings       JSON,                     -- 用户设置
    created_time   DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 研究项目
CREATE TABLE research_project (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    domain       VARCHAR(255),
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_project_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_project_user ON research_project(user_id);

-- 论文文件夹
CREATE TABLE folder (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    parent_id  BIGINT,
    name       VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_folder_user    FOREIGN KEY (user_id)    REFERENCES app_user(id)         ON DELETE CASCADE,
    CONSTRAINT fk_folder_project FOREIGN KEY (project_id) REFERENCES research_project(id) ON DELETE CASCADE,
    CONSTRAINT fk_folder_parent  FOREIGN KEY (parent_id)  REFERENCES folder(id)           ON DELETE SET NULL,
    UNIQUE KEY uk_folder_name (project_id, parent_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 论文（业务元数据）
CREATE TABLE paper (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    folder_id    BIGINT,
    title        VARCHAR(1000),
    authors      TEXT,
    year         INT,
    doi          VARCHAR(255),
    pdf_url      VARCHAR(1000) NOT NULL,
    summary      JSON,                 -- Paper Intelligence Card
    status       VARCHAR(32) DEFAULT 'UPLOADED',  -- UPLOADED/PROCESSING/ANALYZED/READY/FAILED
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_paper_project FOREIGN KEY (project_id) REFERENCES research_project(id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_user    FOREIGN KEY (user_id)    REFERENCES app_user(id)         ON DELETE CASCADE,
    CONSTRAINT fk_paper_folder  FOREIGN KEY (folder_id)  REFERENCES folder(id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_paper_project ON paper(project_id);
CREATE INDEX idx_paper_user    ON paper(user_id);

-- 聊天历史
CREATE TABLE conversation (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    paper_id     BIGINT,
    question     TEXT,
    answer       TEXT,
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_conv_user  FOREIGN KEY (user_id)  REFERENCES app_user(id) ON DELETE CASCADE,
    CONSTRAINT fk_conv_paper FOREIGN KEY (paper_id) REFERENCES paper(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_conv_paper ON conversation(paper_id);

-- AI 任务
CREATE TABLE ai_task (
    task_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    type         VARCHAR(64),    -- PAPER_ANALYSIS / REVIEW_GENERATION
    status       VARCHAR(32) DEFAULT 'PENDING',  -- PENDING/PROCESSING/SUCCESS/FAILED
    result       JSON,
    error        TEXT,
    created_time DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_task_user ON ai_task(user_id);
```

### 与旧 PG schema 的映射差异

| 项 | PostgreSQL（旧） | MySQL（新） |
| --- | --- | --- |
| 主键 | BIGSERIAL | BIGINT AUTO_INCREMENT |
| 时间 | TIMESTAMPTZ | DATETIME(6)（无时区，Java 用 `LocalDateTime`，JDBC `serverTimezone=Asia/Shanghai`） |
| JSON | JSONB | JSON（MyBatis `JsonbTypeHandler` 映射为 VARCHAR 字符串写入） |
| 外键 | REFERENCES ... ON DELETE | CONSTRAINT fk_... FOREIGN KEY ... |
| ai_task 主键 | task_id | task_id（保持一致） |
| paper | 无 folder_id | 新增 folder_id（文件夹归属） |

## PostgreSQL 向量表（pgvector）

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE paper_chunk (
    id        BIGSERIAL PRIMARY KEY,
    paper_id  BIGINT NOT NULL,      -- 逻辑外键 → MySQL paper.id（无物理约束）
    section   VARCHAR(64),          -- abstract/intro/methods/results/discussion/references
    content   TEXT,
    embedding vector(2048)          -- 对应 embedding 模型输出维度
);
CREATE INDEX idx_chunk_paper ON paper_chunk(paper_id);
CREATE INDEX idx_chunk_section ON paper_chunk(section);
CREATE INDEX idx_chunk_embedding ON paper_chunk
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

> 注意：embedding 维度为 **2048**（当前 `.env` 中 `EMBEDDING_DIM=2048`，模型 doubao-embedding-vision）。代码默认值 1536（text-embedding-3-small）仅为兜底，两者不一致会写入失败，需与表定义对齐。

## 关键设计点

- **summary 存 JSON**：Paper Intelligence Card 的结构化字段（method/finding/limitation...）存 JSON，便于灵活扩展，前端直接渲染。
- **paper_chunk.section**：RAG 按论文结构切分的关键，检索时可按 section 过滤。
- **所有业务表带 user_id**：多租户隔离的物理基础（即使能从 project 推导，也冗余存 user_id 加速鉴权查询）。
- **跨库一致性**：`paper_chunk.paper_id` 无物理外键。删除论文流程 = backend 删 MySQL `paper` 行 + 发 MQ 通知 ai-service 清理 PG `paper_chunk`（见 `70-async-mq.md`）。
- **ivfflat lists=100**：小数据集可调，需在插入足够数据后建索引才有效。

## 数据迁移（PG → MySQL）

历史数据迁移脚本：`scripts/migrate_pg_to_mysql.py`

- 使用 psycopg2 读 PG（旧业务表）+ pymysql 写 MySQL。
- 迁移表：`app_user` / `research_project` / `folder` / `paper` / `conversation` / `ai_task`，显式保留原 id。
- 处理：JSONB → json.dumps 字符串、TIMESTAMPTZ → 本地时间、幂等 TRUNCATE（`SET FOREIGN_KEY_CHECKS=0` 逐个执行）。
- **paper_chunk 不迁移**，保留在 PG 作为向量库数据源。
- 迁移验证通过后，PG 中 6 张旧业务表已 DROP（2026-08-13），仅保留 `paper_chunk`；删除前数据备份在 `scripts/backup_pg_business_20260813.sql`（pg_dump --data-only --column-inserts）。
