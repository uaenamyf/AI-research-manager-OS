# date: 2026-07-10
# dev: myf
"""models 包：Pydantic schema 定义。"""

from app.models.schemas import (
    ChatStreamRequest,
    HealthResponse,
    KnowledgeSearchHit,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    PaperAnalyzeRequest,
    PaperAnalyzeResult,
    PaperSimilarityHit,
    PaperSimilarityRequest,
    PaperSimilarityResponse,
    ReviewGenerateRequest,
    WritingRewriteRequest,
    WritingRewriteResult,
)

__all__ = [
    "ChatStreamRequest",
    "HealthResponse",
    "KnowledgeSearchHit",
    "KnowledgeSearchRequest",
    "KnowledgeSearchResponse",
    "PaperAnalyzeRequest",
    "PaperAnalyzeResult",
    "PaperSimilarityHit",
    "PaperSimilarityRequest",
    "PaperSimilarityResponse",
    "ReviewGenerateRequest",
    "WritingRewriteRequest",
    "WritingRewriteResult",
]
