# 50 - 关键 API 契约

## 融合现状（2026-08-18）

> ResearchOS 已融入 DeepSeek Harness（DSH）：Web 入口统一为 DSH GUI（`127.0.0.1:3080`），
> 旧 Next.js 前端已移除（2026-08-19 删 `frontend/`，:3000 下线）。
> **本节为当前生效契约**；下方各节为 legacy 契约描述，保留作历史对照。

### DSH GUI 聊天节点 -> research-* bundle（当前生效的对外契约）

前端不再调用 backend `/api/*`，改为 DSH GUI 中的聊天节点（11 个 `ui-research-*` UI 包，
关键词触发面板 + MCP 工具事件卡片）调用 **bundle 前缀路由**：

| bundle | 前缀路由 | 说明 |
| --- | --- | --- |
| research-auth | `/research-auth` | register / login / logout / me |
| research-project | `/research-project` | 项目 CRUD |
| research-folder | `/research-folder` | 文件夹树 CRUD |
| research-paper | `/research-paper` | 论文 create/import/search/status/card/move/reading/delete |
| research-file | `/research-file` | 本地文件存储（upload-url / multipart / 下载含 Range / 删除） |
| research-writing | `/research-writing` | 写作 Agent（rewrite / translate-machine） |
| research-review | `/research-review` | 综述生成任务 create + 轮询 |
| research-paper-card | `/research-paper-card` | Paper Intelligence Card 生成 |
| research-export | `/research-export` | BibTeX/RIS 导出 + APA/MLA/GB7714 引用 |
| research-settings | `/research-settings` | 用户设置 GET / PUT / PATCH |
| research-subscription | `/research-subscription` | 套餐 / Stripe checkout / webhook |

- **响应契约沿用 `{code, message, data}`**（与原 backend 逐字段一致，可无缝替换）。
- **认证**：JWT **httpOnly cookie 与 `Authorization: Bearer` 双通道**；`research-auth` 与旧
  Spring Boot **共享同一 `JWT_SECRET`（HS256）**，两边签发的 token 双向互通，前端切换无需
  重新登录（详见 `80-security.md`）。
- **内部链路不变**：bundle 的异步任务仍发 RabbitMQ `researchos.ai.task`
  （`paper.analyze` / `review.generate` / `paper.delete`），由 ai-service 消费；backend ↔
  ai-service 内部契约（`X-Internal-Token`、`PATCH /internal/paper/{id}/result`、
  `PATCH /internal/task/{id}/result`）原样保留（backend `:8080` 与 ai-service `:8000`
  仍在运行，双认证 + MQ 管道阶段）。

### 统一 LLM 网关契约（research-llm-gateway bundle，驻 3080）

新增 OpenAI 兼容统一网关，ResearchOS AI（ai-service / bundle 内 LLM 调用）与 DSH 共用同一入口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/chat/completions` | OpenAI 格式（JSON / SSE 流式透传），chat 模型默认 `ark-code-latest` |
| POST | `/v1/embeddings` | 返回 2048 维向量，embedding 模型 `doubao-embedding-vision` |

- **请求侧 key 不校验**：网关为直连上游的 OpenAI 兼容代理，上游 `Authorization` 由网关
  单点注入（`RESEARCH_LLM_API_KEY` / `RESEARCH_EMBEDDING_API_KEY` 等，来自仓库根 `.env`，
  经 `dsh-gateway.sh` 注入启动环境），请求侧传不传 key 均可。
- **上游**：`RESEARCH_LLM_UPSTREAM_BASE_URL`（真实上游，当前
  `https://ark.cn-beijing.volces.com/api/coding/v3`）。
- **调用方**：ai-service（`OPENAI_BASE_URL` / `EMBEDDING_BASE_URL` 指向网关）、
  research-writing / research-paper-card bundle、research-mcp 的 vector_search。

## frontend -> backend（对外 API，统一前缀 `/api`）【已废弃：旧 Next.js 前端已移除】

> ⚠️ 过时注（2026-08-18）：本节为 **legacy 契约**——旧 Next.js 前端已于 2026-08-19 移除，当前 DSH GUI 改调
> 上方「融合现状」的 bundle 前缀路由；本节保留作后端契约的历史记录。

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

> 依赖环境变量：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_RESEARCHER`。未配置时 `createCheckout` 返回 500「Stripe is not configured」，前端优雅降级提示。成功/取消回跳 `{frontend}/settings?upgrade=success|cancelled`（旧前端已移除；当前 DSH GUI 经 `research-settings` / `research-subscription` bundle 处理）。

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
