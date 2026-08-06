# 文件夹管理功能

## 概述

项目内支持层级文件夹结构，用户可以：
- 创建、重命名、删除文件夹
- 移动论文到不同文件夹
- 拖拽排序（待实现）
- 支持无限层级嵌套

## 后端 API

### 文件夹 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/folders` | 创建文件夹 |
| GET | `/api/projects/{projectId}/folders` | 获取子文件夹列表 |
| GET | `/api/projects/{projectId}/folders/tree` | 获取完整文件夹树 |
| PUT | `/api/folders/{folderId}/rename` | 重命名 |
| PUT | `/api/folders/{folderId}/move` | 移动文件夹 |
| DELETE | `/api/folders/{folderId}` | 删除文件夹 |
| PUT | `/api/folders/{folderId}/sort` | 更新排序 |

### 论文关联

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/{projectId}/papers?folderId={id}` | 获取文件夹下的论文 |
| PUT | `/api/papers/{paperId}/move` | 移动论文到文件夹 |

## 数据库 Schema

```sql
CREATE TABLE folder (
    id          BIGSERIAL       PRIMARY KEY,
    user_id     BIGINT          NOT NULL,
    project_id  BIGINT          NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    parent_id   BIGINT          REFERENCES folder(id) ON DELETE SET NULL,
    name        VARCHAR(255)    NOT NULL,
    sort_order  INT             NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, parent_id, name)
);

ALTER TABLE paper ADD COLUMN folder_id BIGINT REFERENCES folder(id) ON DELETE SET NULL;
CREATE INDEX idx_paper_folder_id ON paper(folder_id);
```

## 存储模式切换

### 本地存储模式（默认）

适用于开发环境，无需 S3 配置。文件存储在 `./uploads` 目录。

```yaml
# application.yml
app:
  storage:
    type: local
    local-dir: ./uploads
```

### S3 兼容模式

适用于生产环境，支持 AWS S3、Cloudflare R2 等。

```yaml
app:
  storage:
    type: s3
    bucket: researchos-pdfs
    region: us-east-1
    access-key: ${STORAGE_KEY}
    secret-key: ${STORAGE_SECRET}
    endpoint: ${STORAGE_ENDPOINT} # 可选，用于非 AWS S3
```

## 前端组件

### 项目详情页双面板

- 左侧：文件夹树（可展开/折叠）
- 右侧：当前选中文件夹下的论文列表

### 关键 API

```typescript
// 文件夹
import { folderApi } from "@/lib/api/folders";
folderApi.createFolder(projectId, parentId, name);
folderApi.getFolderTree(projectId);
folderApi.moveFolder(folderId, newParentId);

// 论文（按文件夹筛选）
import { paperApi } from "@/lib/api/papers";
paperApi.listPapers(projectId, folderId);
paperApi.movePaper(paperId, folderId);
```

## 安全边界

- 所有操作校验 `user_id` 归属
- 跨项目移动文件夹被禁止
- 删除文件夹时论文的 `folder_id` 置为 NULL（保留论文）
- 本地文件访问路径校验防止目录遍历

## 已知限制

1. 文件夹树当前不支持无限层级的懒加载（全量加载）
2. 拖拽排序待实现
3. 批量移动论文待实现
