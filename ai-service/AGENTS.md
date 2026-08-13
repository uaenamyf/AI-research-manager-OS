# AI Service 模块规范

> 本文件约束 `ai-service/` 目录下的所有开发。配合根 `CLAUDE.md`（编码规范，尤其是 Python 文件头规则 §3）与 `Implementation/30-ai-service.md` 使用。

## 服务定位

- **角色**：AI 工程师。
- **技术栈**：Python 3.12 + FastAPI + LangGraph + LlamaIndex + PyMuPDF。
- **职责**：PDF 解析、section 切分、embedding、LLM 调用、RAG、Agent 工作流、MQ 消费与回调。

## 铁律（禁止事项）

1. ❌ **禁止写业务表**：`app_user` / `research_project` / `paper` / `conversation` / `ai_task` 一律不可写（这些表在 **MySQL**）。ai-service 只能写 `paper_chunk`（**PostgreSQL** 向量库），业务数据通过回调让 backend 更新。
2. ❌ **禁止直接对前端暴露**：所有端点必须校验 `X-Internal-Token`，只接受 backend 调用。
3. ❌ **禁止持久化用户敏感信息**：LLM API key、用户密钥只在内存/环境变量，不落库不落盘。
4. ❌ **禁止自行查业务库取 paper.pdf_url**：如需 pdf_url，由 backend 在 MQ 消息 payload 中传入。
5. ❌ **禁止用 handoff 实现固定管道**：固定流程（如 paper -> review）用手动顺序执行。

> **双库**：ai-service 维护两个连接池——`DATABASE_URL`（asyncpg → PG 向量库 `paper_chunk`）+ `MYSQL_URL`（aiomysql → MySQL 业务库，**只读** paper 元数据用于 review 等场景，绝不写）。

## 目录职责

```
app/
├── main.py          # FastAPI 入口、路由注册
├── api/routes/      # HTTP 端点（paper/chat/review）
├── agents/          # 4 个业务 Agent（paper/chat/review/writing）
├── rag/             # 检索器、向量存储、embedding
├── parser/          # PDF 解析 + section 切分
├── llm/client.py    # 统一 LLM 客户端（支持 openai/anthropic 切换）
├── worker/          # RabbitMQ 消费者（异步任务）
├── core/            # config、deps、security（内部鉴权）
└── models/          # Pydantic schema
```

## Python 文件头规范（强制）

每个 `.py` 文件顶部**只出现一次**，顺序固定：

```python
# date: 2026-07-08
# dev: myf
"""一行 intro docstring，说明本文件职责。"""
```

**禁止**：
- 文件头出现 `# changelog:`（changelog 写在改动处正上方，见根 CLAUDE.md §4）。
- 文件头出现两个 `# date`。
- 修改文件时在顶部追加新的 `# date` + `# dev` + `# changelog`。

## Agent 输入输出契约

每个 Agent 必须有明确 schema：

| Agent | 输入 | 输出 |
| --- | --- | --- |
| paper_agent | `{ pdf_url }` | `{ title, method, finding, limitation, future_work }` |
| chat_agent | `{ paper_id, question }` | 流式 text（SSE） |
| review_agent | `{ paper_ids, topic }` | markdown 文本 |
| writing_agent | `{ text, action }` | 改写后文本 |

## Agent 实现约束

- **LLM 可替换 provider**：通过 `llm/client.py` 统一封装，环境变量 `LLM_PROVIDER` 切换 openai/anthropic。
- **Prompt 与代码分离**：prompt 模板放 `app/agents/prompts/` 或常量，不散落在逻辑中。
- **RAG 必须带来源**：chat_agent 回答需附引用 chunk_id。
- **不越权**：Agent 只读 `paper_chunk` 与传入的 metadata。

## guardrail 与重试（重要）

> 源自 openai-agents SDK 实践经验。

- output guardrail 触发 `tripwire_triggered=True` 时，SDK **不会自动重试** LLM。
- 必须手动 `try/except` 捕获 `OutputGuardrailTripwireTriggered`，从 `e.guardrail_result.output.output_info` 取反馈，重新调用并注入反馈 prompt。
- Mock 模式测试时，MockSDKModel 返回纯文本不触发工具调用，handoff 链需回退手动链。

## MQ 消费规范

- 消费 `researchos.ai.task` 的 `paper.analyze` / `review.generate`。
- 消费失败重试 3 次（指数退避），超限进 DLQ。
- 处理完成后回调 backend：`PATCH /internal/paper/{id}/result` 或 `/internal/task/{id}/result`，带 `X-Internal-Token`。

## 测试

- LLM 调用必须可 mock，CI 不消耗真实 token。
- 用 fixture 固化 PDF 解析与检索结果。
- 用 pytest + httpx 测试 API。
