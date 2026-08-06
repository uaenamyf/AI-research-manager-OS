# date: 2026-07-10
# dev: myf
"""Embedding 生成：调用 OpenAI text-embedding-3-small，返回向量。"""

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

    async def embed_one(self, text: str) -> list[float]:
        """单条文本 embedding。"""
        client = self._get_client()
        resp = await client.embeddings.create(
            model=self.model,
            input=text,
        )
        return resp.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量 embedding（火山引擎限制每批最多 10 条）。"""
        if not texts:
            return []

        client = self._get_client()
        results: list[list[float]] = []
        batch_size = 10  # 火山引擎 embedding API 限制：每批最多 10 条

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = await client.embeddings.create(
                model=self.model,
                input=batch,
            )
            # 按 index 排序确保顺序（无 index 字段时保持原序）
            if resp.data and hasattr(resp.data[0], "index"):
                sorted_data = sorted(resp.data, key=lambda x: x.index)
            else:
                sorted_data = resp.data
            results.extend([d.embedding for d in sorted_data])

        logger.debug(f"批量 embedding 完成：{len(texts)} 条 -> {len(results)} 向量")
        return results


# 全局单例
embedding_service = EmbeddingService()
