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

> 常规异步任务走 RabbitMQ（见 `70-async-mq.md`），HTTP 端点主要用于同步链路（Chat）与调试。

## ai-service -> backend（回调，带 `X-Internal-Token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PATCH | `/internal/paper/{id}/result` | 论文分析结果回传 `{summary, status}` |
| PATCH | `/internal/task/{id}/result` | 任务结果回传 `{markdown}` 或 `{error}` |
