# date: 2026-08-06
# dev: myf
"""Graph 路由：论文间 embedding 相似度计算（知识图谱边）。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.db import get_db_pool
from app.core.security import verify_internal_token
from app.models import PaperSimilarityRequest

router = APIRouter()


@router.post(
    "/similarities",
    dependencies=[Depends(verify_internal_token)],
)
async def similarities(req: PaperSimilarityRequest):
    """论文两两相似度（基于 paper_chunk 平均向量 cosine）。

    backend 已按 user_id 过滤论文范围并传入 paperIds（多租户边界），
    这里只做向量聚合计算：每篇论文的 chunk 平均向量两两比余弦相似度。
    """
    if len(req.paper_ids) < 2:
        return {"similarities": []}

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH paper_vec AS (
                SELECT paper_id, AVG(embedding) AS vec
                FROM paper_chunk
                WHERE paper_id = ANY($1::int[])
                GROUP BY paper_id
            )
            SELECT a.paper_id AS source, b.paper_id AS target,
                   1 - (a.vec <=> b.vec) AS score
            FROM paper_vec a
            JOIN paper_vec b ON a.paper_id < b.paper_id
            ORDER BY score DESC
            """,
            req.paper_ids,
        )

    logger.info(
        f"图谱相似度：paperIds={len(req.paper_ids)} 篇, 计算 {len(rows)} 对"
    )

    return {
        "similarities": [
            {"source": r["source"], "target": r["target"], "score": float(r["score"])}
            for r in rows
        ]
    }
