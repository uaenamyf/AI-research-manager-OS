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
| POST | `/api/projects/{id}/papers/import` | 文献一键导入（DOI/标题 + 可选 PDF 直链），Crossref 补全元数据 |
| GET | `/api/papers/{id}` | 详情（含 Paper Card） |
| GET | `/api/projects/{id}/papers` | 项目下论文列表 |
| GET | `/api/papers/{id}/status` | 轮询分析状态（或 SSE） |

`POST /api/projects/{id}/papers/import` 请求体：

```json
{
  "doi": "10.1038/s41586-023-06136-6",
  "title": "回退标题（Crossref 不可用时）",
  "authors": ["Alice", "Bob"],
  "year": 2023,
  "pdfUrl": "https://.../paper.pdf",
  "folderId": null
}
```

- `doi` 存在时：经 Crossref 拉取权威 title/authors/year，覆盖请求参数。
- `pdfUrl` 有值：入库即发 `paper.analyze` MQ 触发 AI 分析（状态 `PROCESSING`）。
- `pdfUrl` 为空：仅元数据入库，状态 `UPLOADED`（等后续补 PDF）。
- 响应：`Paper` 实体（含新生成的 `id`）。

### Citation

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/papers/{id}/citation?format=APA` | 单篇论文引用（格式：APA/MLA/GB_7714） |
| POST | `/api/citation/bibliography?format=APA` | 批量生成参考文献列表 |

`POST /api/citation/bibliography` 请求体：

```json
{ "paperIds": [12, 15, 18] }
```

响应：

```json
{
  "citations": ["Vaswani, A., ... (2017). Attention is all you need.",
                "Devlin, J., ... (2019). BERT: Pre-training of deep bidirectional transformers."],
  "format": "APA",
  "count": 2
}
```

### Review

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/review/generate` | body: `{paperIds:[], topic:""}`，返回 taskId |
| GET | `/api/review/{taskId}` | 轮询结果（返回 Markdown） |

### Subscription（Stripe）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/subscription/plans` | 套餐列表（静态元数据：id/label/limit/desc），需登录 |
| POST | `/api/subscription/checkout` | body: `{plan:"PRO|RESEARCHER"}`，创建 Stripe Checkout 会话，返回 `{checkoutUrl, sessionId}`，需登录 |
| POST | `/api/subscription/webhook` | Stripe webhook（`Stripe-Signature` 头），`permitAll`；`checkout.session.completed` → 升级用户套餐（只升不降，幂等） |

> 依赖环境变量：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_RESEARCHER`。未配置时 `createCheckout` 返回 500「Stripe is not configured」，前端优雅降级提示。成功/取消回跳 `{frontend}/settings?upgrade=success|cancelled`。

### Writing（Agent 4：改写 / 润色）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/writing/rewrite` | body: `{text, action, instruction?}`，同步返回 `{action, text}` |

> `action` 取值：`polish` / `expand` / `shorten` / `translate` / `rebuttal` / `cover_letter`。

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
| POST | `/review/generate` | 综述生成 | 同步 |
| POST | `/writing/rewrite` | 文本改写 / 润色（Agent 4） | 同步 |

> 常规异步任务走 RabbitMQ（见 `70-async-mq.md`），HTTP 端点主要用于同步链路（Writing）与调试。

### POST /writing/rewrite（Writing Agent）

> 原 `/writing/transform` 端点已移除（2026-08-10），统一由本端点承担文本改写/润色/翻译/审稿回复/Cover letter。

请求：

```json
{
  "text": "This paper proposes ...",
  "action": "polish",
  "instruction": "translate to Chinese"
}
```

- `action` 枚举：`polish`（润色）/ `expand`（扩写）/ `shorten`（精简）/ `translate`（翻译）/ `rebuttal`（回复审稿人）/ `cover_letter`（Cover letter），未知 action 兜底为 polish。
- `instruction` 可选，用于 translate（目标语言）与 rebuttal（审稿意见）。

响应（200）：

```json
{
  "action": "polish",
  "text": "This manuscript proposes ..."
}
```

- 鉴权：`X-Internal-Token`。
- backend 调用失败（非 200 / 网络异常）时返回 `AI_SERVICE_ERROR`（4001），前端提示「AI 暂时不可用，请重试」。

## ai-service -> backend（回调，带 `X-Internal-Token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PATCH | `/internal/paper/{id}/result` | 论文分析结果回传 `{summary, status}` |
| PATCH | `/internal/task/{id}/result` | 任务结果回传 `{markdown}` 或 `{error}` |
