# date: 2026-07-15
# dev: myf
"""RAG 检索器：embedding 查询 + 向量检索 + section 加权。"""

from dataclasses import dataclass

from loguru import logger

from app.core.config import settings
from app.rag.embedding import embedding_service
from app.rag.vector_store import VectorStore


@dataclass
class RetrievedChunk:
    """检索结果分块。"""

    id: int
    section: str
    content: str
    score: float
    paper_id: int = 0  # 跨论文检索时标识来源论文（单论文检索默认 0）


class Retriever:
    """Section-aware RAG 检索器。

    流程：
    1. 将用户问题 embedding
    2. 从 paper_chunk 表向量检索 top_k 个 chunk
    3. 对 methods 章节的 chunk 加权 ×1.5（方法论更相关）
    """

    # section 权重：methods 加权 1.5，results 加权 1.2，其余 1.0
    SECTION_WEIGHTS: dict[str, float] = {
        "methods": 1.5,
        "results": 1.2,
        "abstract": 1.1,
    }

    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store

    async def retrieve(
        self,
        paper_id: int,
        query: str,
        top_k: int = 0,
    ) -> list[RetrievedChunk]:
        """检索与问题最相关的论文分块。

        Args:
            paper_id: 论文 ID（单论文问答）
            query: 用户问题
            top_k: 返回条数（0 用默认值）
        Returns:
            RetrievedChunk 列表，按加权分数降序
        """
        if not top_k:
            top_k = settings.RETRIEVE_TOP_K

        # 1. 问题 embedding
        query_embedding = await embedding_service.embed_one(query)

        # 2. 向量检索（多取一些，加权后截断）
        raw_results = await self.vector_store.search(
            paper_id, query_embedding, top_k=top_k * 2
        )

        if not raw_results:
            logger.warning(f"检索无结果：paper_id={paper_id}")
            return []

        # 3. section 加权（section 名统一小写后查权重表）
        weighted: list[RetrievedChunk] = []
        for r in raw_results:
            weight = self.SECTION_WEIGHTS.get(r["section"].lower(), 1.0)
            adjusted_score = r["score"] * weight
            weighted.append(
                RetrievedChunk(
                    id=r["id"],
                    section=r["section"],
                    content=r["content"],
                    score=adjusted_score,
                )
            )

        # 4. 按加权分数降序，取 top_k
        weighted.sort(key=lambda x: x.score, reverse=True)
        result = weighted[:top_k]

        logger.info(
            f"检索完成：paper_id={paper_id}, query='{query[:30]}...', "
            f"返回 {len(result)} 个 chunk"
        )
        return result

    async def retrieve_multi(
        self,
        paper_ids: list[int],
        query: str,
        top_k: int = 10,
    ) -> list[RetrievedChunk]:
        """跨论文检索（综述生成用）。

        Args:
            paper_ids: 论文 ID 列表
            query: 检索问题
            top_k: 返回条数
        Returns:
            RetrievedChunk 列表
        """
        if not paper_ids:
            return []

        query_embedding = await embedding_service.embed_one(query)
        raw_results = await self.vector_store.search_multi(
            paper_ids, query_embedding, top_k=top_k * 2
        )

        if not raw_results:
            return []

        weighted: list[RetrievedChunk] = []
        for r in raw_results:
            weight = self.SECTION_WEIGHTS.get(r["section"].lower(), 1.0)
            adjusted_score = r["score"] * weight
            weighted.append(
                RetrievedChunk(
                    id=r["id"],
                    section=r["section"],
                    content=r["content"],
                    score=adjusted_score,
                    paper_id=r["paper_id"],
                )
            )

        weighted.sort(key=lambda x: x.score, reverse=True)
        return weighted[:top_k]
