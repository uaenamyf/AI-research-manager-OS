# 70 - 异步任务流（RabbitMQ）

## RabbitMQ 拓扑

```
Exchange: researchos.ai.task (direct)
  ├─ queue: q.paper.analyze    routing: paper.analyze
  ├─ queue: q.review.generate  routing: review.generate
  └─ queue: q.paper.cleanup    routing: paper.delete   (跨库清理 PG paper_chunk)

Exchange: researchos.ai.dlx (direct)
  └─ queue: q.ai.dlq           routing: q.ai.dlq       (三个队列共用的死信队列)
```

> 队列全部由 backend 创建（RabbitConfig），ai-service 消费者 `passive=True` 只检查不创建；
> 若 backend 尚未启动导致声明失败，消费者在后台每 10s 重试直到成功（2026-08-15 修复，避免启动顺序导致永久不消费）。

## 消息格式（JSON）

```json
{
  "taskId": 123,
  "type": "PAPER_ANALYSIS",
  "payload": { "paperId": 1024 }
}
```

- `type` 取值：`PAPER_ANALYSIS` / `REVIEW_GENERATION` / `PAPER_DELETE`。
- `payload` 由 backend 在发消息时填充（如 paperId、paperIds、topic）。
- ai-service 消费时如需 paper 的 `pdf_url`，**由 backend 在 payload 中传入，不自行查库**。

## 重试与死信

- 消费失败重试 3 次（指数退避）。
- 超过重试次数进 DLQ `q.ai.dlq`（`researchos.ai.dlx`），backend 监听 DLQ 更新 task.status=FAILED。
- 用户可从前端触发「重新分析」，backend 重发 MQ。
- 结果回传**不走 MQ 回调队列**：ai-service 处理完成后直接 HTTP 回调 backend（见下）。

## 回调

ai-service 处理完成后，通过 HTTP 回调 backend：

- 论文分析：`PATCH /internal/paper/{id}/result` body `{summary, status:READY}`
- 综述生成：`PATCH /internal/task/{id}/result` body `{markdown}` 或 `{status:FAILED, error}`

回调同样带 `X-Internal-Token`。

## 跨库清理（双库架构）

业务数据在 MySQL、向量在 PostgreSQL，`paper_chunk.paper_id` 是**逻辑外键**（PG 侧无物理外键，无 CASCADE）。

**删除论文流程**（backend）：

1. backend 删除 MySQL `paper` 行（事务内；同时删 annotation 批注、按 `pdf_url` 删存储中的 PDF 文件）。
2. backend 发 MQ `paper.delete` 到 `q.paper.cleanup`，payload `{ paperId }`。
3. ai-service 消费后执行 `DELETE FROM paper_chunk WHERE paper_id = $1`，完成后确认消息。

> 不可依赖数据库 CASCADE——两张表在不同数据库实例，必须靠 MQ 保证最终一致。
> 2026-08-17：文件删除走 `StorageService.deleteFile(key)`（Local/S3），导入的外链 PDF 跳过。
