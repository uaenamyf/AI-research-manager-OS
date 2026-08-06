# date: 2026-07-19
# dev: myf
"""Review Agent：基于多篇论文生成 Literature Review。"""

import asyncpg
from loguru import logger

from app.agents.prompts.review import REVIEW_SYSTEM, REVIEW_USER
from app.core.config import settings
from app.llm.client import llm_client
from app.rag.retriever import Retriever
from app.rag.vector_store import VectorStore


async def generate_review(
    pool: asyncpg.Pool,
    paper_ids: list[int],
    topic: str,
) -> str:
    """生成综述。

    流程：
    1. 从数据库查询每篇论文的 Paper Card（summary）
    2. 跨论文 RAG 检索与 topic 相关的 chunk
    3. 构造 papers context（Paper Card + 检索到的 chunk）
    4. LLM 生成 Markdown 综述

    Args:
        pool: 数据库连接池
        paper_ids: 论文 ID 列表
        topic: 综述主题
    Returns:
        Markdown 格式的综述文本
    """
    # 1. 查询每篇论文的 Paper Card
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, authors, summary
            FROM paper
            WHERE id = ANY($1::int[])
            """,
            paper_ids,
        )

    if not rows:
        logger.warning(f"综述生成：未找到论文 paper_ids={paper_ids}")
        return "# Literature Review\n\nNo papers found for the given IDs."

    # 2. 构造 papers context（Paper Card 摘要）
    papers_context_parts: list[str] = []
    for i, row in enumerate(rows, 1):
        title = row["title"] or "Untitled"
        authors = row["authors"] or "Unknown"
        summary = row["summary"]

        # 解析 summary JSONB
        if summary and isinstance(summary, str):
            import json
            try:
                summary = json.loads(summary)
            except json.JSONDecodeError:
                summary = {}
        elif summary is None:
            summary = {}

        method = summary.get("method", "N/A") if isinstance(summary, dict) else "N/A"
        finding = summary.get("finding", "N/A") if isinstance(summary, dict) else "N/A"
        limitation = summary.get("limitation", "N/A") if isinstance(summary, dict) else "N/A"

        papers_context_parts.append(
            f"## [Paper {i}] {title}\n"
            f"**Authors:** {authors}\n"
            f"**Method:** {method}\n"
            f"**Finding:** {finding}\n"
            f"**Limitation:** {limitation}\n"
        )

    papers_context = "\n---\n".join(papers_context_parts)

    # 3. 跨论文 RAG 检索（补充细节）
    vector_store = VectorStore(pool)
    retriever = Retriever(vector_store)
    chunks = await retriever.retrieve_multi(paper_ids, topic, top_k=10)

    if chunks:
        chunk_parts = []
        for chunk in chunks:
            chunk_parts.append(
                f"[Paper chunk_id={chunk.id}, section={chunk.section}]\n{chunk.content}"
            )
        papers_context += "\n\n## Additional Retrieved Context\n" + "\n\n".join(chunk_parts)

    # 4. LLM 生成综述
    user_prompt = REVIEW_USER.format(topic=topic, papers=papers_context)

    logger.info(
        f"Review 生成：paper_ids={paper_ids}, topic='{topic[:50]}', "
        f"papers={len(rows)}, chunks={len(chunks)}"
    )

    markdown = await llm_client.complete(
        system=REVIEW_SYSTEM,
        user=user_prompt,
    )

    logger.info(f"Review 生成完成：{len(markdown)} 字符")
    return markdown
