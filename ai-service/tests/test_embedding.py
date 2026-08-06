# date: 2026-07-21
# dev: myf
"""Embedding Service 单元测试。"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.rag.embedding import EmbeddingService


@pytest.fixture
def mock_openai_client():
    """Mock OpenAI 客户端。"""
    mock_client = MagicMock()
    mock_embedding = MagicMock()
    mock_client.embeddings = mock_embedding
    return mock_client


@pytest.fixture
def embedding_service(mock_openai_client):
    """Embedding 服务实例。"""
    service = EmbeddingService()
    # 替换内部客户端创建逻辑
    service._get_client = MagicMock(return_value=mock_openai_client)
    return service


class TestEmbeddingService:
    """Embedding 服务测试用例。"""

    async def test_embed_single_text(self, embedding_service, mock_openai_client):
        """测试单文本 embedding。"""
        # Mock 响应
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_openai_client.embeddings.create = AsyncMock(return_value=mock_response)

        result = await embedding_service.embed("Hello, world!")

        assert len(result) == 1536
        mock_openai_client.embeddings.create.assert_called_once()

    async def test_embed_batch_empty(self, embedding_service):
        """测试空批量 embedding 应该返回空列表。"""
        result = await embedding_service.embed_batch([])
        assert result == []

    async def test_embed_batch_within_batch_size(self, embedding_service, mock_openai_client):
        """测试批量在限制范围内。"""
        # batch_size=10，测试 5 个文本
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1] * 1536) for _ in range(5)]
        mock_openai_client.embeddings.create = AsyncMock(return_value=mock_response)

        texts = [f"Text {i}" for i in range(5)]
        result = await embedding_service.embed_batch(texts)

        assert len(result) == 5
        # 应该只调用一次（5 < 10）
        assert mock_openai_client.embeddings.create.call_count == 1

    async def test_embed_batch_multiple_batches(self, embedding_service, mock_openai_client):
        """测试超过 batch_size 时自动分批。"""
        # batch_size=10，测试 25 个文本 -> 应该分 3 批
        mock_response = MagicMock()

        def create_response(*args, **kwargs):
            input_list = kwargs.get("input", [])
            mock_resp = MagicMock()
            mock_resp.data = [MagicMock(embedding=[0.1] * 1536) for _ in range(len(input_list))]
            return mock_resp

        mock_openai_client.embeddings.create = AsyncMock(side_effect=create_response)

        texts = [f"Text {i}" for i in range(25)]
        result = await embedding_service.embed_batch(texts)

        assert len(result) == 25
        # 应该分 3 批：10 + 10 + 5
        assert mock_openai_client.embeddings.create.call_count == 3
