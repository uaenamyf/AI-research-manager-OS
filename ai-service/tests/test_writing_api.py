# date: 2026-08-06
# dev: myf
"""POST /writing/transform Writing Agent 端点测试。"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

INTERNAL_TOKEN = "dev-internal-token"


class TestWritingAPI:
    """Writing Agent 文本变换接口测试。"""

    def test_transform_polish_returns_result(self):
        """正常润色：返回变换后的文本。"""
        with patch(
            "app.agents.writing_agent.llm_client.complete",
            new=AsyncMock(return_value="Polished academic text."),
        ) as mock_complete:
            client = TestClient(app)
            resp = client.post(
                "/writing/transform",
                json={"text": "this is a draft text", "action": "polish"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["result"] == "Polished academic text."
        # 校验 prompt 中包含对应的 action 指令
        prompt_kwargs = mock_complete.await_args.kwargs
        assert "Action: POLISH" in prompt_kwargs["user"]

    def test_transform_rewrite_action(self):
        """改写 action：使用 rewrite 指令。"""
        with patch(
            "app.agents.writing_agent.llm_client.complete",
            new=AsyncMock(return_value="Rewritten text."),
        ) as mock_complete:
            client = TestClient(app)
            resp = client.post(
                "/writing/transform",
                json={"text": "original", "action": "rewrite"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["result"] == "Rewritten text."
        prompt_kwargs = mock_complete.await_args.kwargs
        assert "Action: REWRITE" in prompt_kwargs["user"]

    def test_transform_unknown_action_falls_back(self):
        """未知 action：兜底为默认 IMPROVE 指令，不报错。"""
        with patch(
            "app.agents.writing_agent.llm_client.complete",
            new=AsyncMock(return_value="Improved text."),
        ) as mock_complete:
            client = TestClient(app)
            resp = client.post(
                "/writing/transform",
                json={"text": "x", "action": "weird_action"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["result"] == "Improved text."
        prompt_kwargs = mock_complete.await_args.kwargs
        assert "Action: IMPROVE" in prompt_kwargs["user"]

    def test_transform_requires_internal_token(self):
        """无内部 token 返回 401（FastAPI 缺 header 校验为 422，二者皆可）。"""
        client = TestClient(app)
        resp = client.post(
            "/writing/transform",
            json={"text": "hello", "action": "polish"},
        )
        assert resp.status_code in (401, 422)

    def test_transform_empty_text(self):
        """空文本也能正常走 LLM（由 LLM 兜底）。"""
        with patch(
            "app.agents.writing_agent.llm_client.complete",
            new=AsyncMock(return_value=""),
        ) as mock_complete:
            client = TestClient(app)
            resp = client.post(
                "/writing/transform",
                json={"text": "", "action": "polish"},
                headers={"X-Internal-Token": INTERNAL_TOKEN},
            )

        assert resp.status_code == 200
        assert resp.json()["result"] == ""
        mock_complete.assert_awaited_once()
