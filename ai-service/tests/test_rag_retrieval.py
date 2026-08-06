# date: 2026-07-23
# dev: myf
"""RAG 检索模块测试（Mock 向量数据库）."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.rag.vector_store import VectorStore
from app.rag.retriever import Retriever, RetrievedChunk


class TestVectorStore:
    """VectorStore 向量存储测试."""

    @pytest.fixture
    def mock_pool(self):
        """Mock asyncpg 连接池."""
        pool = AsyncMock()
        conn = AsyncMock()
        pool.acquire.return_value.__aenter__.return_value = conn
        return pool

    @pytest.fixture
    def vector_store(self, mock_pool):
        """创建 VectorStore 实例."""
        return VectorStore(pool=mock_pool)

    async def test_insert_chunks_success(self, vector_store, mock_pool):
        """测试批量插入 chunk."""
        chunks = [
            ("Introduction", "This is intro.", [0.1] * 1536),
            ("Methods", "This is methods.", [0.2] * 1536),
        ]

        count = await vector_store.insert_chunks(paper_id=1, chunks=chunks)

        assert count == 2
        conn = mock_pool.acquire.return_value.__aenter__.return_value
        assert conn.executemany.call_count == 1

    async def test_insert_empty_chunks(self, vector_store):
        """测试插入空 chunk 列表."""
        count = await vector_store.insert_chunks(paper_id=1, chunks=[])
        assert count == 0
        # 不应该访问数据库
        assert vector_store.pool.acquire.call_count == 0

    async def test_search_returns_results(self, vector_store, mock_pool):
        """测试向量检索返回结果."""
        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetch.return_value = [
            {"id": 1, "section": "Introduction", "content": "Text 1", "score": 0.95},
            {"id": 2, "section": "Methods", "content": "Text 2", "score": 0.82},
        ]

        results = await vector_store.search(
            paper_id=1,
            query_embedding=[0.1] * 1536,
            top_k=2
        )

        assert len(results) == 2
        assert results[0]["score"] == 0.95
        assert results[1]["section"] == "Methods"

    async def test_search_no_results(self, vector_store, mock_pool):
        """测试无检索结果."""
        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetch.return_value = []

        results = await vector_store.search(
            paper_id=999,
            query_embedding=[0.1] * 1536
        )

        assert isinstance(results, list)
        assert len(results) == 0

    async def test_vec_to_str_format(self, vector_store):
        """测试向量转字符串格式."""
        vec = [0.1, 0.2, 0.3]
        vec_str = vector_store._vec_to_str(vec)

        assert vec_str.startswith("[")
        assert vec_str.endswith("]")
        assert "0.1" in vec_str
        assert "0.2" in vec_str


class TestRetriever:
    """Retriever 检索器测试."""

    @pytest.fixture
    def mock_vector_store(self):
        """Mock VectorStore."""
        return AsyncMock()

    @pytest.fixture
    def retriever(self, mock_vector_store):
        """创建 Retriever 实例."""
        return Retriever(vector_store=mock_vector_store)

    async def test_retrieve_returns_weighted_chunks(self, retriever, mock_vector_store):
        """测试检索返回加权后的 chunk."""
        # Mock 向量检索结果
        mock_vector_store.search.return_value = [
            {"id": 1, "section": "Introduction", "content": "Intro text", "score": 0.9},
            {"id": 2, "section": "Methods", "content": "Methods text", "score": 0.8},  # methods 会 ×1.5
        ]

        # Mock embedding
        with patch("app.rag.embedding.embedding_service.embed_one") as mock_embed:
            mock_embed.return_value = [0.1] * 1536

            chunks = await retriever.retrieve(paper_id=1, query="test query", top_k=2)

        assert len(chunks) == 2
        assert isinstance(chunks[0], RetrievedChunk)
        # Methods 加权后分数应该更高排第一
        assert chunks[0].score == 0.8 * 1.5
        assert chunks[1].score == 0.9  # Introduction 无加权

    async def test_retrieve_no_results(self, retriever, mock_vector_store):
        """测试无检索结果."""
        mock_vector_store.search.return_value = []

        with patch("app.rag.embedding.embedding_service.embed_one") as mock_embed:
            mock_embed.return_value = [0.1] * 1536

            chunks = await retriever.retrieve(paper_id=1, query="test query")

        assert isinstance(chunks, list)
        assert len(chunks) == 0

    async def test_section_weights_applied_correctly(self, retriever, mock_vector_store):
        """测试各 section 权重正确应用."""
        mock_vector_store.search.return_value = [
            {"id": 1, "section": "methods", "content": "M", "score": 0.8},      # ×1.5 → 1.2
            {"id": 2, "section": "results", "content": "R", "score": 0.9},     # ×1.2 → 1.08
            {"id": 3, "section": "abstract", "content": "A", "score": 0.95},   # ×1.1 → 1.045
            {"id": 4, "section": "introduction", "content": "I", "score": 1.0},# ×1.0 → 1.0
        ]

        with patch("app.rag.embedding.embedding_service.embed_one") as mock_embed:
            mock_embed.return_value = [0.1] * 1536

            chunks = await retriever.retrieve(paper_id=1, query="test query")

        # 排序后顺序应该是: methods(1.2) > results(1.08) > abstract(1.045) > introduction(1.0)
        assert chunks[0].section == "methods"
        assert chunks[1].section == "results"
        assert chunks[2].section == "abstract"
        assert chunks[3].section == "introduction"
