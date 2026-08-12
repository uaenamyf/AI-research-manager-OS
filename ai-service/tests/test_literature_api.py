# date: 2026-08-12
# dev: myf
"""GET /literature 文献检索路由测试（mock MCP 客户端）。"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.literature_mcp import LiteratureMcpError
from app.main import app

INTERNAL_TOKEN = "dev-internal-token"

FAKE_RESULTS = {
    "query": "transformer attention",
    "parameters": {"limit": 3},
    "results": [
        {"rank": 1, "fused_score": 0.95, "title": "Attention Is All You Need",
         "year": 2017, "identifiers": {"doi": "10.48550/arXiv.1706.03762"}},
    ],
    "source_statuses": [{"source": "pubmed", "status": "ok", "result_count": 1}],
    "total_candidates": 5,
    "returned": 1,
    "all_sources_failed": False,
}

FAKE_SOURCES = {"count": 7, "sources": ["pubmed", "arxiv"]}


class TestLiteratureAPI:
    """文献检索路由测试。"""

    def test_search_returns_results(self):
        """正常检索：透传 MCP 返回体，token 校验通过。"""
        with patch("app.api.routes.literature.search_literature",
                   new=AsyncMock(return_value=FAKE_RESULTS)):
            client = TestClient(app)
            resp = client.get(
                "/literature/search",
                params={"query": "transformer attention", "limit": 3},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["returned"] == 1
        assert body["results"][0]["title"] == "Attention Is All You Need"

    def test_search_splits_sources(self):
        """sources 逗号字符串拆分为列表传给 MCP。"""
        with patch("app.api.routes.literature.search_literature",
                   new=AsyncMock(return_value=FAKE_RESULTS)) as mock_search:
            client = TestClient(app)
            resp = client.get(
                "/literature/search",
                params={"query": "transformer", "sources": "pubmed,arxiv"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        _, kwargs = mock_search.await_args
        assert kwargs["sources"] == ["pubmed", "arxiv"]

    def test_search_requires_internal_token(self):
        """无内部 token 返回 401/422。"""
        client = TestClient(app)
        resp = client.get("/literature/search", params={"query": "x"})
        assert resp.status_code in (401, 422)

    def test_search_blank_query_rejected(self):
        """query 为空返回 422。"""
        client = TestClient(app)
        resp = client.get(
            "/literature/search",
            params={"query": "  "},
            headers={"X-Internal-Token": INTERNAL_TOKEN},
        )
        assert resp.status_code == 422

    def test_search_mcp_error_returns_502(self):
        """MCP 客户端异常转换为 502。"""
        with patch("app.api.routes.literature.search_literature",
                   new=AsyncMock(side_effect=LiteratureMcpError("学术检索服务不可用"))):
            client = TestClient(app)
            resp = client.get(
                "/literature/search",
                params={"query": "x"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 502
        assert "不可用" in resp.json()["detail"]

    def test_sources_returns_sources(self):
        """列出数据源。"""
        with patch("app.api.routes.literature.list_sources",
                   new=AsyncMock(return_value=FAKE_SOURCES)):
            client = TestClient(app)
            resp = client.get(
                "/literature/sources",
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["count"] == 7
