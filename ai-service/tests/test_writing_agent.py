# date: 2026-07-26
# dev: myf
"""Writing Agent 改写测试（LLM mock，不消耗真实 token）。"""

import pytest

from app.agents import writing_agent
from app.agents.writing_agent import SUPPORTED_ACTIONS, _strip_code_fence, rewrite


def test_supported_actions():
    """支持的动作齐全。"""
    for action in ("polish", "expand", "shorten", "translate", "rebuttal", "cover_letter"):
        assert action in SUPPORTED_ACTIONS


def test_strip_code_fence():
    """去除 markdown 代码围栏。"""
    assert _strip_code_fence("```\nhello\n```") == "hello"
    assert _strip_code_fence("plain") == "plain"


@pytest.mark.asyncio
async def test_rewrite_empty_text():
    """空文本直接返回空串，不调用 LLM。"""
    assert await rewrite("", "polish") == ""
    assert await rewrite("   ", "polish") == ""


@pytest.mark.asyncio
async def test_rewrite_polish(monkeypatch):
    """polish 动作：注入正确指令并返回 LLM 结果。"""
    captured = {}

    async def fake_complete(system, user, model=""):
        captured["system"] = system
        captured["user"] = user
        return "Polished academic text."

    monkeypatch.setattr(writing_agent.llm_client, "complete", fake_complete)

    result = await rewrite("my rough draft", "polish")
    assert result == "Polished academic text."
    assert "my rough draft" in captured["user"]
    assert "Polish" in captured["user"]


@pytest.mark.asyncio
async def test_rewrite_unknown_action_falls_back(monkeypatch):
    """未知 action 回退到 polish，仍能改写。"""
    captured = {}

    async def fake_complete(system, user, model=""):
        captured["user"] = user
        return "output"

    monkeypatch.setattr(writing_agent.llm_client, "complete", fake_complete)

    result = await rewrite("text", "nonsense_action")
    assert result == "output"
    # 回退到 polish 的指令
    assert "Polish" in captured["user"]


@pytest.mark.asyncio
async def test_rewrite_with_instruction(monkeypatch):
    """带 instruction（如翻译目标语言）时应注入 prompt。"""
    captured = {}

    async def fake_complete(system, user, model=""):
        captured["user"] = user
        return "翻译结果"

    monkeypatch.setattr(writing_agent.llm_client, "complete", fake_complete)

    result = await rewrite("hello world", "translate", "translate to Chinese")
    assert result == "翻译结果"
    assert "translate to Chinese" in captured["user"]
    assert "INSTRUCTION" in captured["user"]


@pytest.mark.asyncio
async def test_rewrite_strips_fence(monkeypatch):
    """LLM 返回带围栏时应去除。"""

    async def fake_complete(system, user, model=""):
        return "```\nclean text\n```"

    monkeypatch.setattr(writing_agent.llm_client, "complete", fake_complete)

    result = await rewrite("x", "polish")
    assert result == "clean text"
