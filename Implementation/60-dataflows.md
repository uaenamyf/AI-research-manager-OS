# 60 - 核心数据流

## 融合现状（2026-08-19）

> ResearchOS 已融入 DeepSeek Harness（DSH）：业务能力由 12 个 research bundles（auth / project / folder / paper / file / writing / review / paper-card / export / settings / subscription / llm-gateway）+ research-mcp（stdio MCP server）承载，AI 管道由 research-ai-worker（`RESEARCH_AI_INLINE=1` inline，无 MQ）承载，统一 LLM 网关为 research-llm-gateway（驻 127.0.0.1:3080，OpenAI 兼容 `/v1/chat/completions` + `/v1/embeddings`）。前端 = DSH GUI（旧 Next.js :3000 已于 2026-08-19 移除；backend / ai-service 亦于同日移除）。
> 本节补充 DSH 侧四条数据流；下方 6.1 / 6.4 / 6.5（上传分析 / Review / 删除论文）等 legacy 链路仅作历史参考。

### ① Bundle CRUD 流（同步 REST）

```
[DSH Web GUI / 外部客户端]
    ↓ HTTP（JWT 双认证：DSH 与 backend 共享 JWT_SECRET，HS256，token 互通）
[ctx.webServer 前缀路由 /research-*]
    ↓
[research-auth / research-project / research-folder / research-paper bundle]
    ├── mysql2 直连 MySQL 业务表（app_user / research_project / folder / paper）
    └── 返回统一契约 {code, message, data}（分页 ?page=&size=）
```

- 认证走 `JWT_SECRET`（HS256）；内部调用带 `X-Internal-Token`；bundle 查询强制 `user_id` 过滤（越权 404）。

### ② AI 管道流（inline，无 MQ）

- research-paper / research-review bundle 收到异步任务后，经 research-ai-worker **inline 直调**（`RESEARCH_AI_INLINE=1`）完成 PDF 解析 / embedding / 卡片 / 综述 / 写作，完成后直接写 MySQL（paper / ai_task 状态）与 PG（paper_chunk 向量）。
- legacy RabbitMQ 拓扑与回调契约见 `70-async-mq.md`（已下线，仅作历史参考）。

### ③ MCP 文献流

```
[DSH agent（LLM）]
    ↓ 调用 ctx.tools 中注册的 MCP 工具（research-mcp 由 dsh mcp-client 拉起，stdio）
[research-mcp（stdio MCP server）]
    ├── mcp__research__literature_search           文献检索（MySQL paper 表）
    ├── mcp__research__literature_get              按 id 读取文献元数据 + 摘要
    ├── mcp__research__literature_cite             生成引用（bibtex / ris）
    └── mcp__research__literature_vector_search    向量语义检索（PG paper_chunk）
    ↓
[DSH UI 聊天节点渲染检索 / 引用结果]
```

### ④ 统一 LLM 网关流

```
[research-writing / research-review / research-paper-card bundle / research-ai-worker]
    │
    ├─ POST http://127.0.0.1:3080/v1/chat/completions（chat 模型 ark-code-latest）
    └─ POST http://127.0.0.1:3080/v1/embeddings（embedding 模型 doubao-embedding-vision，2048 维）
```

- 统一网关 = research-llm-gateway bundle（驻 3080），OpenAI 兼容直连代理，上游 `RESEARCH_LLM_UPSTREAM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3`，key/模型单点收口于 `.env`。
- DSH 单实例驻 127.0.0.1:3080（`scripts/dsh-gateway.sh` 启动），自动注入 LLM key/模型 + JWT_SECRET + MySQL / Stripe env + `RESEARCH_GATEWAY_URL`。

> 融合前三条核心链路（上传分析 / Chat / Review）语义由 research-ai-worker inline 承接；legacy 描述见 6.1 / 6.4 / 6.5，仅作历史参考。

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
