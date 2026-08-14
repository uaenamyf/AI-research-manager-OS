# 30 - AI 服务实现（FastAPI）

## 目录结构

```
ai-service/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── api/
│   │   ├── routes/
│   │   │   ├── paper.py     # POST /paper/analyze
│   │   │   ├── chat.py      # POST /rag/chat/stream (SSE) + POST /rag/chat (非流式)
│   │   │   └── review.py    # POST /review/generate
│   ├── agents/
│   │   ├── paper_agent.py
│   │   ├── chat_agent.py
│   │   ├── review_agent.py
│   │   └── writing_agent.py
│   ├── rag/
│   │   ├── retriever.py     # 检索器（section-aware）
│   │   ├── vector_store.py   # pgvector 操作
│   │   └── embedding.py      # OpenAI embedding
│   ├── parser/
│   │   └── pdf_parser.py     # PyMuPDF + section 切分
│   ├── llm/
│   │   └── client.py         # 统一 LLM 客户端
│   ├── worker/
│   │   └── consumer.py       # RabbitMQ 消费者（paper.analyze / review.generate / paper.delete）
│   │                          # 队列未就绪时后台重试（backend 未启动不丢消费）
│   ├── core/
│   │   ├── config.py         # Settings（pydantic-settings）
│   │   ├── deps.py           # 依赖注入
│   │   └── security.py       # 内部服务鉴权
│   └── models/              # Pydantic schema
├── tests/
├── pyproject.toml
└── Dockerfile
```

## 健康检查与路由

```python
# app/main.py
app = FastAPI(title="ResearchOS AI Service")

@app.get("/health")
def health(): return {"status": "ok"}

app.include_router(paper_router,   prefix="/paper", tags=["paper"])
app.include_router(chat_router,    prefix="/rag",   tags=["rag"])
app.include_router(review_router,  prefix="/review", tags=["review"])
```

## Paper Agent（生成 Paper Intelligence Card + Tags）

`app/agents/paper_agent.py` 调用 LLM 生成结构化论文摘要，字段：
`title / authors / year / doi / method / finding / limitation / future_work / tags`。

`tags` 为 `[{name, category}]` 数组（`app/models/schemas.py` 的 `PaperTag`）：
- `name`：仅限**方法论**或**宽泛领域**（如「深度学习」「信号处理」「生物声学」），由 LLM 基于论文 Keywords 与摘要**归纳**生成（4-8 个），不使用论文标题，也不逐字照抄 keywords。
- `category`：所属**顶层大类领域**（如「人工智能」「生物」「工程」「数学」），相似方法论归入同一大类（「深度学习」「强化学习」都归「人工智能」）；大类本身也可作为 tag 使用。
- **禁止**使用细分领域作 category（如 Wildlife Biology、marine biology、Bioacoustics 这类子领域只能出现在 `name`）。
- 随 `summary` 回调 backend 存入 `paper.summary`（JSONB），供 Knowledge Tags / Graph 使用。

## 内部鉴权（backend -> ai-service）

ai-service 只接受 backend 的调用，用共享密钥校验：

```python
# app/core/security.py
async def verify_internal_token(x_internal_token: str = Header(...)):
    if x_internal_token != settings.INTERNAL_TOKEN:
        raise HTTPException(401, "unauthorized internal call")
```

## RAG 实现细节

### Section-aware 切分

```python
# app/parser/pdf_parser.py
SECTION_PATTERNS = {
    "abstract": r"abstract",
    "introduction": r"^\d?\.?\s*introduction",
    "methods": r"^\d?\.?\s*(methods?|materials and methods)",
    "results": r"^\d?\.?\s*results",
    "discussion": r"^\d?\.?\s*discussion",
    "references": r"^\d?\.?\s*references",
}

def parse_and_chunk(pdf_bytes: bytes) -> list[Chunk]:
    text = extract_text(pdf_bytes)          # PyMuPDF
    sections = split_by_section(text)      # 按正则匹配章节标题
    chunks = []
    for section, content in sections.items():
        for piece in sliding_window(content, size=512, overlap=64):
            chunks.append(Chunk(section=section, content=piece))
    return chunks
```

### 检索策略

```python
# app/rag/retriever.py
async def retrieve(paper_id: int, query: str, top_k: int = 5) -> list[Chunk]:
    q_emb = await embed(query)
    # 1. 向量相似度（cosine）
    # 2. 限定 paper_id（单论文问答）或不限定（跨论文综述）
    # 3. section 加权：methods section 权重 ×1.5
    rows = await pool.fetch("""
        SELECT id, section, content,
               1 - (embedding <=> $1) AS score
        FROM paper_chunk
        WHERE paper_id = $2
        ORDER BY embedding <=> $1
        LIMIT $3
    """, q_emb, paper_id, top_k)
    return rows
```

### Prompt 模板

```
You are a research assistant. Answer based ONLY on the provided paper context.
If the answer is not in the context, say "This is not mentioned in the paper."

[CONTEXT]
{retrieved_chunks}

[QUESTION]
{user_question}
```
