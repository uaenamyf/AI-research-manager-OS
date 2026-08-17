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

## 6.4 Literature Review 生成（异步）

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

## 6.5 删除论文（跨库向量清理，2026-08-15 实现；08-17 补文件清理）

```
[Frontend] DELETE /api/papers/{id}
    ↓
[Backend] PaperServiceImpl.deletePaper
    ├── 1. requirePaperOwnedBy 校验归属（返回 paper，取 pdf_url）
    ├── 2. 删 MySQL paper 行（事务内）
    ├── 3. 发 MQ {taskId, type:PAPER_DELETE, payload:{paperId}} → q.paper.cleanup
    └── 4. storageService.deleteFile(pdf_url) 删 PDF 文件（尽力而为；外链 URL 跳过）
    ↓
[ai-service] consumer._on_paper_delete_message
    └── DELETE FROM paper_chunk WHERE paper_id = $1（幂等，无需回调）
```

> 双库无物理外键，必须靠 MQ 保证最终一致；删除失败时 chunk 残留，重发消息可幂等清理。
> 2026-08-17：PDF 文件删除由 `StorageService.deleteFile(key)` 实现（Local 删本地文件+空目录、S3 删对象），
> 导入的外链 PDF（pdf_url 以 http 开头）不属于本系统存储，跳过不删；文件删除失败只记日志不阻断事务。

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
