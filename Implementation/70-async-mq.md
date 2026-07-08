# 70 - 异步任务流（RabbitMQ）

## RabbitMQ 拓扑

```
Exchange: researchos.ai.task (direct)
  ├─ queue: q.paper.analyze    routing: paper.analyze
  └─ queue: q.review.generate  routing: review.generate

Exchange: researchos.ai.callback (direct)
  └─ queue: q.backend.callback  routing: task.callback
```

## 消息格式（JSON）

```json
{
  "taskId": 123,
  "type": "PAPER_ANALYSIS",
  "payload": { "paperId": 1024 }
}
```

- `type` 取值：`PAPER_ANALYSIS` / `REVIEW_GENERATION`。
- `payload` 由 backend 在发消息时填充（如 paperId、paperIds、topic）。
- ai-service 消费时如需 paper 的 `pdf_url`，**由 backend 在 payload 中传入，不自行查库**。

## 重试与死信

- 消费失败重试 3 次（指数退避）。
- 超过重试次数进 DLQ `q.paper.analyze.dlq`，backend 监听 DLQ 更新 task.status=FAILED。
- 用户可从前端触发「重新分析」，backend 重发 MQ。

## 回调

ai-service 处理完成后，通过 HTTP 回调 backend：

- 论文分析：`PATCH /internal/paper/{id}/result` body `{summary, status:READY}`
- 综述生成：`PATCH /internal/task/{id}/result` body `{markdown}` 或 `{status:FAILED, error}`

回调同样带 `X-Internal-Token`。
