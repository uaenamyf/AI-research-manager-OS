# date: 2026-08-06
# dev: myf
"""POST /search Knowledge 语义搜索端点测试。"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

INTERNAL_TOKEN = "dev-internal-token"


def _mock_pool():
    """返回不会在测试中被真正使用的 mock 连接池（get_db_pool 的返回值）。"""
    return MagicMock()


class TestSearchAPI:
    """Knowledge 语义搜索接口测试。"""

    def test_search_returns_hits(self):
        """正常检索：返回命中 chunk，含 paperId/section/score。"""
        fake_rows = [
            {"id": 1, "paper_id": 10, "section": "methods",
             "content": "Individual recognition ...", "score": 0.82},
            {"id": 2, "paper_id": 20, "section": "abstract",
             "content": "We propose ...", "score": 0.71},
        ]
        with patch("app.api.routes.search.get_db_pool",
                   new=AsyncMock(return_value=_mock_pool())), \
             patch("app.rag.vector_store.VectorStore.search_multi",
                   new=AsyncMock(return_value=fake_rows)), \
             patch("app.rag.retriever.embedding_service.embed_one",
                   new=AsyncMock(return_value=[0.1] * 1536)):
            client = TestClient(app)
            resp = client.post(
                "/search",
                json={"paperIds": [10, 20], "query": "individual recognition"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        results = resp.json()["results"]
        assert len(results) == 2
        # methods 权重 1.5 > abstract 权重 1.1，加权后 methods 在前
        assert results[0]["paperId"] == 10
        assert results[0]["section"] == "methods"
        assert results[0]["score"] == pytest.approx(0.82 * 1.5)
        assert results[1]["paperId"] == 20

    def test_search_requires_internal_token(self):
        """无内部 token 返回 401（FastAPI 缺 header 校验为 422，二者皆可）。"""
        client = TestClient(app)
        resp = client.post(
            "/search",
            json={"paperIds": [1], "query": "x"},
        )
        assert resp.status_code in (401, 422)

    def test_search_empty_paper_ids(self):
        """paperIds 为空直接返回空结果，不触发 embedding。"""
        with patch("app.api.routes.search.get_db_pool",
                   new=AsyncMock(return_value=_mock_pool())), \
             patch("app.rag.vector_store.VectorStore.search_multi",
                   new=AsyncMock(return_value=[])), \
             patch("app.rag.retriever.embedding_service.embed_one",
                   new=AsyncMock(return_value=[0.1] * 1536)) as mock_embed:
            client = TestClient(app)
            resp = client.post(
                "/search",
                json={"paperIds": [], "query": "x"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["results"] == []
        mock_embed.assert_not_awaited()

    def test_search_top_k_limits_results(self):
        """topK 限制返回条数。"""
        fake_rows = [
            {"id": i, "paper_id": 10, "section": "abstract",
             "content": f"chunk {i}", "score": 0.9 - i * 0.05}
            for i in range(5)
        ]
        with patch("app.api.routes.search.get_db_pool",
                   new=AsyncMock(return_value=_mock_pool())), \
             patch("app.rag.vector_store.VectorStore.search_multi",
                   new=AsyncMock(return_value=fake_rows)), \
             patch("app.rag.retriever.embedding_service.embed_one",
                   new=AsyncMock(return_value=[0.1] * 1536)):
            client = TestClient(app)
            resp = client.post(
                "/search",
                json={"paperIds": [10], "query": "x", "topK": 3},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert len(resp.json()["results"]) == 3
