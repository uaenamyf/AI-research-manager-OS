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
| POST | `/search` | Knowledge 跨论文语义搜索 | 同步 |
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

### POST /search（Knowledge 语义搜索）

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

## ai-service -> backend（回调，带 `X-Internal-Token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PATCH | `/internal/paper/{id}/result` | 论文分析结果回传 `{summary, status}` |
| PATCH | `/internal/task/{id}/result` | 任务结果回传 `{markdown}` 或 `{error}` |
