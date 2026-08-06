-- V2__folder_structure.sql: 文件夹层级结构
-- date: 2026-07-23
-- dev: myf

CREATE TABLE folder (
    id          BIGSERIAL       PRIMARY KEY,
    user_id     BIGINT          NOT NULL,
    project_id  BIGINT          NOT NULL REFERENCES research_project(id) ON DELETE CASCADE,
    parent_id   BIGINT          REFERENCES folder(id) ON DELETE SET NULL,
    name        VARCHAR(255)    NOT NULL,
    sort_order  INT             NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE (project_id, parent_id, name)
);

CREATE INDEX idx_folder_user_id ON folder(user_id);
CREATE INDEX idx_folder_project_id ON folder(project_id);
CREATE INDEX idx_folder_parent_id ON folder(parent_id);

-- paper 表增加 folder_id 字段
ALTER TABLE paper ADD COLUMN folder_id BIGINT REFERENCES folder(id) ON DELETE SET NULL;
CREATE INDEX idx_paper_folder_id ON paper(folder_id);
