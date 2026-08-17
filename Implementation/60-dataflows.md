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

## 6.2 Knowledge Base（Tags / Search / Graph）

```
[Frontend] GET /api/knowledge/tags
    ↓
[Backend] KnowledgeServiceImpl.listTags
    ├── 取该用户全部 paper.summary
    └── 聚合 summary.tags（[{name, category}]）：
        ├── 具体 tag 统计 count（如「机器学习」）
        └── 大类 category 统计 count（如「人工智能」）
    ↓
[Frontend] Tags Tab 按 category 分组渲染
```

```
[Frontend] GET /api/knowledge/search?q=&limit=
    ↓
[Backend] KnowledgeServiceImpl.search
    └── title / authors 大小写不敏感 LIKE 模糊匹配（内存过滤）
        （不做 RAG 向量检索；ai-service /search 接口保留未删）
```

```
[Frontend] GET /api/knowledge/graph
    ↓
[Backend] KnowledgeServiceImpl.graph
    ├── 主路径：两两论文按共享 tag（含大类）数建边，weight=共享数
    └── 均无 tags（旧数据）时降级：POST ai-service /graph/similarities
        → 向量相似度建边（reason=semantic）
```

- tags 来源：paper_agent 生成 Paper Card 时由 LLM 基于 Keywords + 摘要生成
  `tags: [{name, category}]`（见 30-ai-service.md §paper_agent），
  随 `summary` 回调入库（JSONB）。

## 6.3 Paper Chat（同步 SSE + 非流式）

```
[Frontend] GET /papers/{id}/chat/stream?q=Why+CNN        （流式）
    ↓
[Backend] chat 模块
    ├── 鉴权 + 校验论文归属/READY
    └── 转发 ai-service POST /rag/chat/stream (SSE)
    ↓
[ai-service] chat_agent
    ├── retriever 检索 paper_chunk（带 paper_id 过滤）
    ├── 构造 prompt：context + question
    └── LLM stream -> 逐 token SSE 返回
    ↓
[Backend] 透传 SSE -> [Frontend]

非流式（2026-08-15 补齐）：
[Frontend] POST /api/papers/{id}/chat {question}
    ↓
[Backend] ChatService.ask -> POST ai-service /rag/chat
    ↓
[ai-service] 同流式逻辑，LLM 一次性补全
    ↓ 返回 {answer, citations}
[Backend] 落库 conversation 历史 -> 返回 {question, answer}
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

## 6.5 删除论文（跨库向量清理，2026-08-15 实现；08-17 补批注与文件清理）

```
[Frontend] DELETE /api/papers/{id}
    ↓
[Backend] PaperServiceImpl.deletePaper
    ├── 1. requirePaperOwnedBy 校验归属（返回 paper，取 pdf_url）
    ├── 2. 删 annotation（无外键，手动清理避免孤儿行）
    ├── 3. 删 MySQL paper 行（事务内；conversation 靠外键 ON DELETE CASCADE 级联）
    ├── 4. 发 MQ {taskId, type:PAPER_DELETE, payload:{paperId}} → q.paper.cleanup
    └── 5. storageService.deleteFile(pdf_url) 删 PDF 文件（尽力而为；外链 URL 跳过）
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
