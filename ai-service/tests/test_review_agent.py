# date: 2026-07-26
# dev: myf
"""Review Agent 综述生成测试（LLM 与向量检索均 mock，不消耗真实 token）。"""

import json

import pytest

from app.agents import review_agent
from app.agents.review_agent import (
    _build_excerpts_block,
    _build_papers_block,
    _format_summary,
    _strip_code_fence,
    generate_review,
)


def test_format_summary_from_dict():
    """dict 形式 summary 格式化含各字段。"""
    summary = {
        "method": "transformer",
        "finding": "95% accuracy",
        "limitation": "small dataset",
        "future_work": "scale up",
    }
    text = _format_summary(summary)
    assert "transformer" in text
    assert "95% accuracy" in text
    assert "Method" in text


def test_format_summary_from_json_string():
    """JSON 字符串（asyncpg JSONB 默认返回）也能解析。"""
    summary = json.dumps({"method": "CNN", "finding": "good"})
    text = _format_summary(summary)
    assert "CNN" in text
    assert "good" in text


def test_format_summary_empty():
    """空 summary 返回空串。"""
    assert _format_summary(None) == ""
    assert _format_summary("") == ""


def test_build_papers_block_has_markers():
    """论文清单包含引用标记与年份。"""
    papers = [
        {"id": 10, "title": "Paper A", "authors": "Alice", "year": 2023, "summary": None},
        {"id": 20, "title": "Paper B", "authors": "Bob", "year": None, "summary": None},
    ]
    marker_map = {10: "P1", 20: "P2"}
    block = _build_papers_block(papers, marker_map)
    assert "[P1] Paper A — Alice (2023)" in block
    assert "[P2] Paper B — Bob (n.d.)" in block


def test_build_excerpts_block_marks_source():
    """检索片段标注来源论文标记与 section（RAG 带来源）。"""
    chunks = [
        {"id": 1, "paper_id": 10, "section": "methods", "content": "we use X", "score": 0.9},
        {"id": 2, "paper_id": 20, "section": "results", "content": "we found Y", "score": 0.8},
    ]
    marker_map = {10: "P1", 20: "P2"}
    block = _build_excerpts_block(chunks, marker_map)
    assert "P1" in block and "methods" in block and "we use X" in block
    assert "P2" in block and "results" in block


def test_build_excerpts_block_empty():
    """无片段返回占位文本。"""
    assert "No relevant excerpts" in _build_excerpts_block([], {})


def test_strip_code_fence():
    """去除 markdown 代码围栏。"""
    fenced = "```markdown\n# Title\ncontent\n```"
    assert _strip_code_fence(fenced) == "# Title\ncontent"
    assert _strip_code_fence("# Plain") == "# Plain"


@pytest.mark.asyncio
async def test_generate_review_empty_paper_ids():
    """空 paper_ids 直接返回占位综述，不调用 LLM。"""
    result = await generate_review(pool=None, paper_ids=[], topic="anything")
    assert "No papers provided" in result


@pytest.mark.asyncio
async def test_generate_review_orchestration(monkeypatch):
    """全链路 mock：metadata + 检索 + LLM，验证编排与产出。"""

    async def fake_fetch(pool, paper_ids):
        return [
            {"id": 1, "title": "T1", "authors": "A", "year": 2024, "summary": None},
            {"id": 2, "title": "T2", "authors": "B", "year": 2025, "summary": None},
        ]

    async def fake_embed_one(text):
        return [0.1, 0.2, 0.3]

    async def fake_search_multi(self, paper_ids, embedding, top_k):
        return [
            {"id": 5, "paper_id": 1, "section": "methods", "content": "m1", "score": 0.9},
        ]

    captured = {}

    async def fake_complete(system, user, model=""):
        captured["system"] = system
        captured["user"] = user
        return "# Review\n\nSynthesis [P1][P2]."

    monkeypatch.setattr(review_agent, "_fetch_paper_metadata", fake_fetch)
    monkeypatch.setattr(
        review_agent.embedding_service, "embed_one", fake_embed_one
    )
    monkeypatch.setattr(
        review_agent.VectorStore, "search_multi", fake_search_multi
    )
    monkeypatch.setattr(review_agent.llm_client, "complete", fake_complete)

    result = await generate_review(pool=object(), paper_ids=[1, 2], topic="deep learning")

    assert result.startswith("# Review")
    # 论文清单与主题应注入 prompt
    assert "T1" in captured["user"]
    assert "deep learning" in captured["user"]
    # 检索片段来源标记应出现在 prompt
    assert "P1" in captured["user"]
