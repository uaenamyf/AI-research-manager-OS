# date: 2026-08-15
# dev: myf
"""段落级文献推荐端点：选中文本 → 向量检索 → 返回相关论文与证据。"""

from fastapi import APIRouter, Depends

from app.core.db import get_db_pool
from app.core.security import verify_internal_token
from app.rag.embedding import embedding_service
from app.rag.vector_store import VectorStore
from pydantic import BaseModel, Field
from loguru import logger

router = APIRouter()


class RecommendRequest(BaseModel):
    text: str = Field(..., min_length=10, description="段落文本")
    paper_ids: list[int] | None = Field(default=None, description="限定论文 ID 列表，空则搜索全部")
    top_k: int = Field(default=10, ge=1, le=50, description="返回条数")


class RecommendChunk(BaseModel):
    paper_id: int
    section: str | None
    content: str
    score: float
    stance: str = "related"  # supporting | contrasting | related


@router.post("/recommend")
async def recommend(req: RecommendRequest):
    """段落级文献推荐：输入文本 → embedding → 向量检索 → 返回相关证据片段。"""
    pool = await get_db_pool()
    vector_store = VectorStore(pool)

    # 1. 文本 embedding
    query_embedding = await embedding_service.embed_one(req.text)
    logger.info(f"推荐 embedding 完成：text='{req.text[:50]}...'")

    # 2. 向量检索
    if req.paper_ids:
        raw_results = await vector_store.search_multi(
            req.paper_ids, query_embedding, top_k=req.top_k
        )
    else:
        # paper_ids 为空时返回空结果（需要指定论文才能搜索）
        raw_results = []

    if not raw_results:
        logger.info("推荐无结果")
        return {"results": []}

    # 3. 判断 stance（基于简单启发式）
    results = []
    for r in raw_results:
        content_lower = r["content"].lower()
        if any(word in content_lower for word in ["however", "contrary", "limitation", "drawback", "but", "although"]):
            stance = "contrasting"
        elif r["score"] > 0.8:
            stance = "supporting"
        else:
            stance = "related"

        results.append(RecommendChunk(
            paper_id=r["paper_id"],
            section=r.get("section"),
            content=r["content"],
            score=r["score"],
            stance=stance,
        ).model_dump())

    logger.info(f"推荐返回 {len(results)} 条结果")
    return {"results": results}