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


class HealthResponse(BaseModel):
    """健康检查响应。"""

    status: str = "ok"
    version: str = "0.1.0"
