# date: 2026-07-10
# dev: myf
"""Pydantic schema：请求/响应模型，与 backend DTO 对齐。"""

from pydantic import BaseModel, ConfigDict, Field


class LlmOverride(BaseModel):
    """请求级 LLM 配置覆盖（用户自定义 API Key / Base URL / 模型）。

    所有字段均可选，None 表示使用系统全局配置。
    """

    model_config = ConfigDict(populate_by_name=True)

    provider: str | None = None
    api_key: str | None = Field(default=None, alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    default_model: str | None = Field(default=None, alias="defaultModel")
    temperature: float | None = None


class PaperAnalyzeRequest(BaseModel):
    """POST /paper/analyze 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_id: int = Field(..., alias="paperId")
    pdf_url: str = Field(..., alias="pdfUrl")


class PaperTag(BaseModel):
    """论文标签：具体 tag + 所属大类（category）。

    例如 {"name": "机器学习", "category": "人工智能"}；
    category 即「领域大类」，可单独作为 tag 使用（如「工业领域」「生物领域」）。
    """

    name: str = ""
    category: str = ""


class PaperAnalyzeResult(BaseModel):
    """paper_agent 输出，回调 backend 的 summary 字段。"""

    title: str = ""
    authors: str = ""
    year: int | None = None
    doi: str = ""
    keywords: list[str] = []
    abstract: str = ""
    workflow: str = ""
    method: str = ""
    finding: str = ""
    limitation: str = ""
    future_work: str = ""
    # AI 根据 Keywords + 摘要生成的标签（带大类归属），用于 Knowledge Tags / Graph
    tags: list[PaperTag] = []


class ChatStreamRequest(BaseModel):
    """POST /rag/chat/stream 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_id: int = Field(..., alias="paperId")
    question: str
    # 2026-08-12 myf: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    llm_override: LlmOverride | None = Field(default=None, alias="llmOverride")
    # 2026-08-12 myf: 用户自定义 RAG 检索参数（0/None 用系统默认）
    retrieve_top_k: int | None = Field(default=None, alias="retrieveTopK")
    similarity_threshold: float | None = Field(default=None, alias="similarityThreshold")


class ReviewGenerateRequest(BaseModel):
    """POST /review/generate 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_ids: list[int] = Field(..., alias="paperIds")
    topic: str = ""
    # 2026-08-12 myf: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    llm_override: LlmOverride | None = Field(default=None, alias="llmOverride")


class KnowledgeSearchRequest(BaseModel):
    """POST /search 请求体（Knowledge 语义搜索）。

    搜索范围（paperIds）由 backend 按 user_id 过滤后传入，
    ai-service 不查业务表，只做 embedding + 向量检索。
    """

    model_config = ConfigDict(populate_by_name=True)

    paper_ids: list[int] = Field(..., alias="paperIds")
    query: str
    top_k: int = Field(20, alias="topK")


class KnowledgeSearchHit(BaseModel):
    """语义搜索结果项。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_id: int = Field(..., alias="paperId")
    section: str = ""
    content: str = ""
    score: float = 0.0


class KnowledgeSearchResponse(BaseModel):
    """语义搜索结果。"""

    results: list[KnowledgeSearchHit] = []


class WritingRewriteRequest(BaseModel):
    """POST /writing/rewrite 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    text: str
    # 改写动作：polish | expand | shorten | translate | rebuttal | cover_letter
    action: str = "polish"
    # 可选：额外指令（如翻译目标语言、审稿意见内容）
    instruction: str = ""
    # 2026-08-12 myf: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    llm_override: LlmOverride | None = Field(default=None, alias="llmOverride")


class WritingRewriteResult(BaseModel):
    """writing_agent 输出。"""

    action: str
    text: str


class PaperSimilarityRequest(BaseModel):
    """POST /graph/similarities 请求体（论文相似度）。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_ids: list[int] = Field(..., alias="paperIds")


class PaperSimilarityHit(BaseModel):
    """论文相似度对（图谱边）。"""

    model_config = ConfigDict(populate_by_name=True)

    source: int
    target: int
    score: float = 0.0


class PaperSimilarityResponse(BaseModel):
    """论文相似度结果。"""

    similarities: list[PaperSimilarityHit] = []


class HealthResponse(BaseModel):
    """健康检查响应。"""

    status: str = "ok"
    version: str = "0.1.0"
