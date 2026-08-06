# date: 2026-08-06
# dev: myf
"""搜索路由：Knowledge 语义搜索（跨论文向量检索）。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.db import get_db_pool
from app.core.security import verify_internal_token
from app.models import KnowledgeSearchRequest
from app.rag.retriever import Retriever
from app.rag.vector_store import VectorStore

router = APIRouter()


@router.post(
    "/search",
    dependencies=[Depends(verify_internal_token)],
)
async def search(req: KnowledgeSearchRequest):
    """Knowledge 语义搜索。

    backend 已按 user_id 过滤论文范围并传入 paperIds（多租户边界），
    这里只做 query embedding + pgvector 检索，返回命中的 chunk。
    """
    pool = await get_db_pool()
    vector_store = VectorStore(pool)
    retriever = Retriever(vector_store)

    chunks = await retriever.retrieve_multi(
        req.paper_ids, req.query, top_k=req.top_k
    )

    logger.info(
        f"Knowledge 搜索：paperIds={len(req.paper_ids)} 篇, "
        f"query='{req.query[:30]}', 命中 {len(chunks)} 个 chunk"
    )

    return {
        "results": [
            {
                "paperId": c.paper_id,
                "section": c.section,
                "content": c.content,
                "score": c.score,
            }
            for c in chunks
        ]
    }
