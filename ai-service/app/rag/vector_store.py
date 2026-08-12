# date: 2026-07-10
# dev: myf
"""向量存储：pgvector 的 paper_chunk 表读写。"""

import asyncpg
from loguru import logger

from app.core.config import settings


class VectorStore:
    """paper_chunk 表操作：批量写入向量、检索、删除。

    约束：只操作 paper_chunk 表（ai-service 唯一可写的业务表）。
    """

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def insert_chunks(
        self,
        paper_id: int,
        chunks: list[tuple[str, str, list[float]]],
    ) -> int:
        """批量写入分块向量。

        Args:
            paper_id: 论文 ID
            chunks: [(section, content, embedding), ...]
        Returns:
            写入条数
        """
        if not chunks:
            return 0

        # pgvector 用 '[1,2,3]' 字符串格式写入
        records = [
            (paper_id, section, content, self._vec_to_str(emb))
            for section, content, emb in chunks
        ]

        async with self.pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO paper_chunk (paper_id, section, content, embedding)
                VALUES ($1, $2, $3, $4::vector)
                """,
                records,
            )

        logger.info(f"写入 {len(records)} 个 chunk（paper_id={paper_id}）")
        return len(records)

    async def search(
        self,
        paper_id: int,
        query_embedding: list[float],
        top_k: int = 5,
        similarity_threshold: float | None = None,
    ) -> list[dict]:
        """向量相似度检索（cosine），限定 paper_id。

        Args:
            paper_id: 论文 ID（单论文问答时过滤）
            query_embedding: 查询向量
            top_k: 返回条数
            similarity_threshold: 相似度下限（过滤低分结果，None 不过滤）
        Returns:
            [{id, section, content, score}, ...]
        """
        vec_str = self._vec_to_str(query_embedding)

        # 2026-08-12 myf: 支持用户自定义相似度阈值
        if similarity_threshold is not None:
            sql = """
                SELECT id, section, content,
                       1 - (embedding <=> $1::vector) AS score
                FROM paper_chunk
                WHERE paper_id = $2
                  AND 1 - (embedding <=> $1::vector) >= $3
                ORDER BY embedding <=> $1::vector
                LIMIT $4
            """
            params = [vec_str, paper_id, similarity_threshold, top_k]
        else:
            sql = """
                SELECT id, section, content,
                       1 - (embedding <=> $1::vector) AS score
                FROM paper_chunk
                WHERE paper_id = $2
                ORDER BY embedding <=> $1::vector
                LIMIT $3
            """
            params = [vec_str, paper_id, top_k]

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        return [
            {
                "id": row["id"],
                "section": row["section"],
                "content": row["content"],
                "score": float(row["score"]),
            }
            for row in rows
        ]

    async def search_multi(
        self,
        paper_ids: list[int],
        query_embedding: list[float],
        top_k: int = 10,
    ) -> list[dict]:
        """跨论文向量检索（综述生成用）。"""
        if not paper_ids:
            return []

        vec_str = self._vec_to_str(query_embedding)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, paper_id, section, content,
                       1 - (embedding <=> $1::vector) AS score
                FROM paper_chunk
                WHERE paper_id = ANY($2::int[])
                ORDER BY embedding <=> $1::vector
                LIMIT $3
                """,
                vec_str,
                paper_ids,
                top_k,
            )

        return [
            {
                "id": row["id"],
                "paper_id": row["paper_id"],
                "section": row["section"],
                "content": row["content"],
                "score": float(row["score"]),
            }
            for row in rows
        ]

    async def delete_by_paper(self, paper_id: int) -> int:
        """删除论文的所有分块（论文删除时清理）。"""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM paper_chunk WHERE paper_id = $1",
                paper_id,
            )
        logger.info(f"删除 paper_id={paper_id} 的 chunk")
        return int(result.split()[-1])

    @staticmethod
    def _vec_to_str(vec: list[float]) -> str:
        """将向量列表转为 pgvector 字符串格式 '[1,2,3]'。"""
        return "[" + ",".join(str(v) for v in vec) + "]"
