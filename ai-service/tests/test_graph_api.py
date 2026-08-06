# date: 2026-08-06
# dev: myf
"""POST /graph/similarities 论文相似度端点测试。"""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

INTERNAL_TOKEN = "dev-internal-token"


class FakeAsyncContextManager:
    """模拟 asyncpg pool.acquire() 的异步上下文管理器（Python 3.14 mock 兼容）。"""

    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _mock_pool_with_fetch(rows):
    """返回带 fetch 结果的 mock 连接池。"""
    pool = MagicMock()
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=rows)
    pool.acquire.return_value = FakeAsyncContextManager(conn)
    return pool


class TestGraphAPI:
    """论文相似度接口测试。"""

    def test_similarities_returns_pairs(self):
        """正常计算：返回论文两两相似度对。"""
        fake_rows = [
            {"source": 10, "target": 20, "score": 0.87},
            {"source": 10, "target": 30, "score": 0.62},
            {"source": 20, "target": 30, "score": 0.45},
        ]
        with patch(
            "app.api.routes.graph.get_db_pool",
            new=AsyncMock(return_value=_mock_pool_with_fetch(fake_rows)),
        ):
            client = TestClient(app)
            resp = client.post(
                "/graph/similarities",
                json={"paperIds": [10, 20, 30]},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        sims = resp.json()["similarities"]
        assert len(sims) == 3
        assert sims[0]["source"] == 10
        assert sims[0]["target"] == 20
        assert sims[0]["score"] == 0.87

    def test_similarities_less_than_two_papers(self):
        """论文少于 2 篇：直接返回空，不触发查询。"""
        with patch(
            "app.api.routes.graph.get_db_pool",
            new=AsyncMock(return_value=_mock_pool_with_fetch([])),
        ):
            client = TestClient(app)
            resp = client.post(
                "/graph/similarities",
                json={"paperIds": [10]},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["similarities"] == []

    def test_similarities_requires_internal_token(self):
        """无内部 token 返回 401（FastAPI 缺 header 校验为 422，二者皆可）。"""
        client = TestClient(app)
        resp = client.post(
            "/graph/similarities",
            json={"paperIds": [1, 2]},
        )
        assert resp.status_code in (401, 422)

    def test_similarities_empty_paper_ids(self):
        """paperIds 为空：返回空结果。"""
        with patch(
            "app.api.routes.graph.get_db_pool",
            new=AsyncMock(return_value=_mock_pool_with_fetch([])),
        ):
            client = TestClient(app)
            resp = client.post(
                "/graph/similarities",
                json={"paperIds": []},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["similarities"] == []
