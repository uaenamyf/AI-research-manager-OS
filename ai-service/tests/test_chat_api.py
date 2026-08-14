# date: 2026-08-15
# dev: myf
"""POST /rag/chat 非流式问答路由测试（mock 检索与 LLM，不消耗真实 token）。"""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

INTERNAL_TOKEN = "dev-internal-token"

FAKE_CHUNKS = [
    MagicMock(id=1, section="methods", content="They used CNN."),
    MagicMock(id=2, section="results", content="Accuracy improved."),
]


class TestChatOnceAPI:
    """非流式问答接口测试。"""

    def test_chat_once_returns_answer_and_citations(self):
        """正常问答：返回完整回答 + 引用 chunk_id。"""
        fake_retriever = MagicMock()
        fake_retriever.retrieve = AsyncMock(return_value=FAKE_CHUNKS)

        with (
            # 路由内 `from app.core.db import get_db_pool`（函数级导入），
            # 需 patch 源模块属性；避免依赖 lifespan 连接池
            patch(
                "app.core.db.get_db_pool",
                new=AsyncMock(return_value=MagicMock()),
            ),
            patch(
                "app.api.routes.chat.Retriever",
                return_value=fake_retriever,
            ),
            # 路由内从 app.llm.client 导入单例 llm_client，patch 其 complete
            patch(
                "app.llm.client.llm_client.complete",
                new=AsyncMock(return_value="The answer."),
            ),
        ):
            resp = TestClient(app).post(
                "/rag/chat",
                json={"paperId": 100, "question": "What method?"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"] == "The answer."
        assert body["citations"] == [1, 2]

    def test_chat_once_rejects_wrong_token(self):
        """错误内部 token 时返回 401。"""
        resp = TestClient(app).post(
            "/rag/chat",
            json={"paperId": 100, "question": "What method?"},
            headers={"X-Internal-Token": "wrong-token"},
        )
        assert resp.status_code == 401
