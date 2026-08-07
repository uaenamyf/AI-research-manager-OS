# date: 2026-07-10
# dev: myf
"""Embedding 生成：调用 OpenAI 兼容 embedding API（火山引擎），返回向量。"""

import asyncio

from loguru import logger
from openai import AsyncOpenAI

from app.core.config import settings


class EmbeddingService:
    """Embedding 服务：将文本转为向量。"""

    def __init__(self):
        self.model = settings.EMBEDDING_MODEL
        self.dim = settings.EMBEDDING_DIM
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            # embedding 优先用独立的 key/base_url，回退到 LLM 的配置
            api_key = settings.EMBEDDING_API_KEY or settings.OPENAI_API_KEY
            kwargs = {"api_key": api_key}
            base_url = settings.EMBEDDING_BASE_URL or settings.OPENAI_BASE_URL
            if base_url:
                kwargs["base_url"] = base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    async def _create_with_retry(self, client: AsyncOpenAI, batch: list[str]) -> object:
        """调用 embedding API，429 限流时指数退避重试。"""
        max_retries = 5
        base_delay = 2.0
        for attempt in range(1, max_retries + 1):
            try:
                return await client.embeddings.create(
                    model=self.model,
                    input=batch,
                )
            except Exception as e:
                is_rate_limit = "429" in str(e) or "RateLimit" in type(e).__name__ \
                    or "TooManyRequests" in str(e)
                if is_rate_limit and attempt < max_retries:
                    delay = base_delay * (2 ** (attempt - 1))
                    logger.warning(
                        f"embedding 限流（{e.__class__.__name__}），"
                        f"{delay:.0f}s 后重试（{attempt}/{max_retries}）"
                    )
                    await asyncio.sleep(delay)
                    continue
                raise

    async def embed_one(self, text: str) -> list[float]:
        """单条文本 embedding。"""
        client = self._get_client()
        resp = await self._create_with_retry(client, [text])
        return resp.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量 embedding（火山引擎限制每批最多 10 条）。

        - 每批之间间隔 1s，降低触发账户级限流概率
        - 429 时指数退避重试（_create_with_retry）
        """
        if not texts:
            return []

        client = self._get_client()
        results: list[list[float]] = []
        batch_size = 10  # 火山引擎 embedding API 限制：每批最多 10 条

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = await self._create_with_retry(client, batch)
            # 按 index 排序确保顺序（无 index 字段时保持原序）
            if resp.data and hasattr(resp.data[0], "index"):
                sorted_data = sorted(resp.data, key=lambda x: x.index)
            else:
                sorted_data = resp.data
            results.extend([d.embedding for d in sorted_data])

            # 批间延迟，避免触发火山引擎账户级限流
            if i + batch_size < len(texts):
                await asyncio.sleep(1.0)

        logger.debug(f"批量 embedding 完成：{len(texts)} 条 -> {len(results)} 向量")
        return results


# 全局单例
embedding_service = EmbeddingService()
