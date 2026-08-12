# date: 2026-07-15
# dev: myf
"""Chat Agent：基于论文上下文的流式问答。"""

from typing import AsyncIterator

from loguru import logger

from app.agents.prompts.chat import CHAT_SYSTEM, CHAT_USER
from app.llm.client import llm_client
from app.rag.retriever import RetrievedChunk, Retriever


def build_context(chunks: list[RetrievedChunk]) -> str:
    """将检索到的 chunk 构造为 context 文本。

    格式：
    [Section: methods] (chunk_id=5)
    content...

    [Section: results] (chunk_id=8)
    content...
    """
    if not chunks:
        return "(No relevant context found)"

    parts: list[str] = []
    for chunk in chunks:
        parts.append(
            f"[Section: {chunk.section}] (chunk_id={chunk.id})\n{chunk.content}"
        )
    return "\n\n---\n\n".join(parts)


async def chat_stream(
    retriever: Retriever,
    paper_id: int,
    question: str,
    top_k: int = 0,
    similarity_threshold: float | None = None,
    override=None,
) -> AsyncIterator[str]:
    """流式问答：检索论文上下文 + LLM 流式生成。

    Args:
        retriever: RAG 检索器
        paper_id: 论文 ID
        question: 用户问题
        top_k: 检索条数
        similarity_threshold: 相似度下限（过滤低分结果）
        override: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    Yields:
        逐 token 的回答文本
    """
    # 1. RAG 检索
    chunks = await retriever.retrieve(
        paper_id, question, top_k, similarity_threshold
    )

    # 2. 构造 context
    context = build_context(chunks)
    user_prompt = CHAT_USER.format(context=context, question=question)

    # 提取引用的 chunk_id（用于前端展示来源）
    citation_ids = [c.id for c in chunks]

    logger.info(
        f"Chat 生成：paper_id={paper_id}, "
        f"检索到 {len(chunks)} 个 chunk, citations={citation_ids}"
    )

    # 3. LLM 流式生成
    async for token in llm_client.stream(
        system=CHAT_SYSTEM,
        user=user_prompt,
        override=override,
    ):
        yield token


def get_citation_ids(chunks: list[RetrievedChunk]) -> list[int]:
    """提取引用的 chunk_id 列表。"""
    return [c.id for c in chunks]
