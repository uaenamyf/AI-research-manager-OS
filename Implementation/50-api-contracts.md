# 50 - 关键 API 契约

## frontend -> backend（对外 API，统一前缀 `/api`）

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 邮箱注册 |
| POST | `/api/auth/login` | 登录，返回 JWT（httpOnly cookie） |
| GET | `/api/auth/oauth/google` | Google OAuth 重定向 |

### Project

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects` | 列表 |
| GET | `/api/projects/{id}` | 详情 |

### Paper

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects/{id}/papers` | 上传 PDF（multipart），返回 paperId |
| GET | `/api/papers/{id}` | 详情（含 Paper Card） |
| GET | `/api/projects/{id}/papers` | 项目下论文列表 |
| GET | `/api/papers/{id}/status` | 轮询分析状态（或 SSE） |

### Chat

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/papers/{id}/chat` | 提问（非流式） |
| GET | `/api/papers/{id}/chat/stream?q=` | 流式问答（SSE） |

### Review

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/review/generate` | body: `{paperIds:[], topic:""}`，返回 taskId |
| GET | `/api/review/{taskId}` | 轮询结果（返回 Markdown） |

### Knowledge（F6 知识库）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/knowledge/tags` | AI 标签聚合（含大类 category） |
| GET | `/api/knowledge/search?q=&limit=` | title/authors 模糊搜索 |
| GET | `/api/knowledge/graph` | 知识图谱（tags 共享建边） |

`GET /api/knowledge/tags` 响应 `data` 示例：

```json
[
  {"id": null, "name": "人工智能", "count": 3, "category": null},
  {"id": null, "name": "机器学习", "count": 2, "category": "人工智能"},
  {"id": null, "name": "工业领域", "count": 1, "category": null}
]
```

- `category` 为该 tag 所属大类（如「机器学习」->「人工智能」）；`category` 为 `null` 表示该 tag 本身是大类（可直接作分组标题）。
- tags 来源：各论文 summary（Paper Card）中 AI 生成的 `tags` 数组（`[{name, category}]`），聚合统计 count。

`GET /api/knowledge/search` 响应 `data` 示例：

```json
[
  {
    "paperId": 10,
    "title": "ERes2NetV2: ...",
    "authors": "Yafeng Chen, ...",
    "snippet": "ERes2NetV2: Boosting Short-Duration Speaker Verifi...",
    "tags": ["声纹识别", "深度学习"],
    "score": 1.0
  }
]
```

- 匹配范围：论文 title / authors 大小写不敏感包含匹配。
- `snippet` 当前为 title；`score` 固定 1.0（模糊搜索无相关度排序，按论文 id 顺序返回）。

`GET /api/knowledge/graph` 响应 `data`：

```json
{
  "nodes": [{"id": 10, "title": "...", "authors": "...", "tags": ["..."]}],
  "links": [{"source": 10, "target": 11, "weight": 2, "reason": "tag"}]
}
```

- 建边规则：两两论文共享 tag（具体 tag + 大类）数 >= 1 即建边，`weight` = 共享 tag 数；共享判断同时覆盖具体 tag 与所属大类（「机器学习」与「强化学习」同属「人工智能」即可通过大类关联）。
- 论文均无 tags（旧数据）时降级为向量相似度建边（`reason=semantic`）。

### Paper 上传响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "paperId": 1024,
    "status": "PROCESSING"
  }
}
```

## backend -> ai-service（内部 API，带 `X-Internal-Token`）

| 方法 | 路径 | 说明 | 模式 |
| --- | --- | --- | --- |
| POST | `/paper/analyze` | PDF 分析（少用，主要调试） | 同步 |
| POST | `/rag/chat/stream` | RAG 问答流式 | SSE |
| POST | `/review/generate` | 综述生成 | 同步 |
| POST | `/search` | Knowledge 跨论文语义搜索（接口保留，当前 backend 未调用） | 同步 |
| POST | `/graph/similarities` | Knowledge 图谱论文两两相似度（接口保留，当前仅 tags 为空时降级用） | 同步 |
| POST | `/writing/transform` | Writing Agent 文本变换 | 同步 |

> 常规异步任务走 RabbitMQ（见 `70-async-mq.md`），HTTP 端点主要用于同步链路（Chat）、语义搜索与调试。

### POST /writing/transform（Writing Agent）

请求：

```json
{
  "text": "This paper proposes ...",
  "action": "polish"
}
```

- `action` 枚举：`rewrite`（改写）/ `polish`（润色）/ `review_response`（回复审稿人）/ `cover_letter`（Cover letter），未知 action 兜底为 IMPROVE。

响应（200）：

```json
{
  "result": "This manuscript proposes ..."
}
```

- 鉴权：`X-Internal-Token`，与 `/rag/chat/stream` 一致。
- backend 调用失败（非 200 / 网络异常）时返回 `AI_SERVICE_ERROR`（4001），前端提示「AI 暂时不可用，请重试」。

### POST /search（Knowledge 语义搜索，当前保留未调用）

> 阶段二改造后，Knowledge Search 改为对论文 title/authors 做 LIKE 模糊搜索（backend 内存过滤），不再调用本接口。接口与实现保留，后续可恢复 RAG 搜索。

请求：

```json
{
  "paperIds": [10, 11],
  "query": "transformer attention",
  "topK": 20
}
```

- `topK` 缺省 20，最多返回条数（backend 传入用户请求的 `limit`）。

响应（200）：

```json
{
  "results": [
    {
      "paperId": 10,
      "section": "methods",
      "content": "We propose the Transformer architecture...",
      "score": 0.87
    }
  ]
}
```

- `content` 为命中的 chunk 原文（backend 截断为 snippet 展示）。
- 鉴权：`X-Internal-Token`，与 `/rag/chat/stream` 一致。
- backend 调用失败（非 200 / 网络异常）时降级为 title/authors LIKE 模糊搜索，不向用户透传错误。

### POST /graph/similarities（Knowledge 图谱相似度，当前降级用）

> 阶段二改造后，图谱主路径改为按论文 AI tags 共享数建边（`reason=tag`）；仅当论文均无 tags（旧数据）时降级调用本接口做向量相似度建边。

请求：

```json
{
  "paperIds": [10, 11, 12]
}
```

- `paperIds`：backend 按 user_id 过滤后的论文 id 列表（多租户边界在 backend）。
- 少于 2 篇返回空 `similarities`。

响应（200）：

```json
{
  "similarities": [
    {"source": 10, "target": 11, "score": 0.83},
    {"source": 10, "target": 12, "score": 0.41}
  ]
}
```

- 计算方式：`paper_chunk` 按 paper_id 聚合平均向量（`AVG(embedding)`），两两算余弦相似度（`1 - (vec <=> vec)`），按 `score DESC` 排序。
- `score` ∈ [-1, 1]，越大越相似。
- 鉴权：`X-Internal-Token`，与 `/rag/chat/stream` 一致。
- backend 处理（当前仅降级路径）：过滤 `score >= 0.55` 的边，每篇最多 6 条边、总边数上限 60；主路径为按论文 AI tags 共享数建边（`reason=tag`）。

## ai-service -> backend（回调，带 `X-Internal-Token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PATCH | `/internal/paper/{id}/result` | 论文分析结果回传 `{summary, status}` |
| PATCH | `/internal/task/{id}/result` | 任务结果回传 `{markdown}` 或 `{error}` |
