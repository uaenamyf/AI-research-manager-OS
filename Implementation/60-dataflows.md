# 60 - 核心数据流

## 6.1 上传论文 -> AI 分析（异步）

```
[Frontend] 上传 PDF
    ↓ multipart
[Backend] paper 模块
    ├── 1. 校验额度（subscription）
    ├── 2. 上传 S3，得到 pdf_url
    ├── 3. 写 paper 记录 status=UPLOADED
    ├── 4. 发 MQ 消息 {paperId, type:PAPER_ANALYSIS}
    └── 5. 返回 {paperId, status:PROCESSING}
    ↓
[RabbitMQ] researchos.ai.task
    ↓
[ai-service worker] consumer.py
    ├── 6. 更新 status=PROCESSING
    ├── 7. pdf_parser 解析 + section 切分
    ├── 8. embedding -> pgvector
    ├── 9. paper_agent 生成 Paper Intelligence Card
    └── 10. 回调 backend PATCH /internal/paper/{id}/result {summary, status:READY}
    ↓
[Backend] 更新 paper.summary + status=READY
    ↓
[Frontend] 轮询 /papers/{id}/status 或 SSE 通知
```

## 6.2 Paper Chat（同步 SSE）

```
[Frontend] GET /papers/{id}/chat/stream?q=Why+CNN
    ↓
[Backend] chat 模块
    ├── 鉴权 + 额度
    └── 转发 ai-service POST /rag/chat/stream (SSE)
    ↓
[ai-service] chat_agent
    ├── retriever 检索 paper_chunk（带 paper_id 过滤）
    ├── 构造 prompt：context + question
    └── LLM stream -> 逐 token SSE 返回
    ↓
[Backend] 透传 SSE -> [Frontend]
```

## 6.3 Literature Review 生成（异步）

```
[Frontend] POST /review/generate {paperIds, topic}
    ↓
[Backend] ai-task
    ├── 创建 ai_task status=PENDING
    ├── 发 MQ {taskId, paperIds, topic, type:REVIEW_GENERATION}
    └── 返回 taskId
    ↓
[ai-service] review_agent
    ├── retriever 批量检索相关 chunk
    ├── 按 methods/limitations 分组
    ├── LLM 生成综述 + 插入引用
    └── 回调 backend PATCH /internal/task/{id}/result {markdown}
    ↓
[Backend] 更新 task.result + status=SUCCESS
    ↓
[Frontend] 轮询 /review/{taskId}
```

## 状态机（单一数据源在 backend）

### 论文状态机

```
UPLOADED -> PROCESSING -> READY
                    \-> FAILED
```

- 状态字段在 backend `paper.status`，是前端查询的唯一来源。
- ai-service 处理中不直接改 `paper.status`，而是回调 backend 由 backend 改。

### AI 任务状态机

```
PENDING -> PROCESSING -> SUCCESS
                    \-> FAILED
```

- `ai_task` 表由 backend 创建与维护。
- ai-service 通过回调间接更新，回调 payload：`{ status, result, error }`。
