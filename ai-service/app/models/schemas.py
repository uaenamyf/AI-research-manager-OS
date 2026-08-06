# date: 2026-07-10
# dev: myf
"""Pydantic schema：请求/响应模型，与 backend DTO 对齐。"""

from pydantic import BaseModel, ConfigDict, Field


class PaperAnalyzeRequest(BaseModel):
    """POST /paper/analyze 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_id: int = Field(..., alias="paperId")
    pdf_url: str = Field(..., alias="pdfUrl")


class PaperAnalyzeResult(BaseModel):
    """paper_agent 输出，回调 backend 的 summary 字段。"""

    title: str = ""
    authors: str = ""
    year: int | None = None
    doi: str = ""
    method: str = ""
    finding: str = ""
    limitation: str = ""
    future_work: str = ""


class ChatStreamRequest(BaseModel):
    """POST /rag/chat/stream 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_id: int = Field(..., alias="paperId")
    question: str


class ReviewGenerateRequest(BaseModel):
    """POST /review/generate 请求体。"""

    model_config = ConfigDict(populate_by_name=True)

    paper_ids: list[int] = Field(..., alias="paperIds")
    topic: str = ""


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


class WritingTransformRequest(BaseModel):
    """POST /writing/transform 请求体（Writing Agent）。"""

    model_config = ConfigDict(populate_by_name=True)

    text: str
    action: str = "polish"


class WritingTransformResponse(BaseModel):
    """Writing Agent 变换结果。"""

    result: str = ""


class HealthResponse(BaseModel):
    """健康检查响应。"""

    status: str = "ok"
    version: str = "0.1.0"
