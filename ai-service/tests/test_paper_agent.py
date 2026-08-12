# date: 2026-08-11
# dev: myf
"""Paper Agent 单元测试：覆盖 keywords/abstract/workflow 字段解析。"""

import pytest

from app.agents.paper_agent import _parse_json_response, _parse_string_list


class TestParseStringList:
    """_parse_string_list：兼容数组与逗号分隔字符串。"""

    def test_list_input(self):
        assert _parse_string_list(["Deep Learning", "Bioacoustics"]) == [
            "Deep Learning",
            "Bioacoustics",
        ]

    def test_string_input(self):
        assert _parse_string_list("Deep Learning, Bioacoustics") == [
            "Deep Learning",
            "Bioacoustics",
        ]

    def test_empty_and_none(self):
        assert _parse_string_list(None) == []
        assert _parse_string_list([]) == []
        assert _parse_string_list("") == []

    def test_filters_blank_items(self):
        assert _parse_string_list(["a", " ", "", "b"]) == ["a", "b"]


class TestParseJsonResponse:
    """_parse_json_response：新字段 keywords/abstract/workflow 解析。"""

    def test_full_fields(self):
        raw = """{
          "title": "Test Paper",
          "authors": "Alice, Bob",
          "year": 2024,
          "doi": "10.1000/xyz",
          "keywords": ["Deep Learning", "Signal Processing"],
          "abstract": "We propose a novel method.",
          "workflow": "Collected data, preprocessed, trained model, evaluated.",
          "method": "CNN",
          "finding": "SOTA results.",
          "limitation": "Small dataset.",
          "future_work": "Scale up.",
          "tags": [{"name": "深度学习", "category": "人工智能"}]
        }"""
        result = _parse_json_response(raw)
        assert result.keywords == ["Deep Learning", "Signal Processing"]
        assert result.abstract == "We propose a novel method."
        assert "Collected data" in result.workflow
        # 旧字段保留，供 review_agent / Knowledge tags 使用
        assert result.method == "CNN"
        assert result.finding == "SOTA results."
        assert result.limitation == "Small dataset."
        assert result.future_work == "Scale up."
        assert len(result.tags) == 1
        assert result.tags[0].name == "深度学习"

    def test_missing_new_fields_default(self):
        """旧版 LLM 输出缺新字段时使用默认值，不报错。"""
        raw = '{"title": "Old", "method": "M", "finding": "F"}'
        result = _parse_json_response(raw)
        assert result.keywords == []
        assert result.abstract == ""
        assert result.workflow == ""
        assert result.title == "Old"

    def test_keywords_comma_string(self):
        """LLM 返回逗号分隔字符串时兼容。"""
        raw = '{"keywords": "A, B, C"}'
        result = _parse_json_response(raw)
        assert result.keywords == ["A", "B", "C"]

    def test_markdown_wrapped(self):
        """兼容 markdown 代码块包裹。"""
        raw = '```json\n{"keywords": ["X"], "abstract": "abs"}\n```'
        result = _parse_json_response(raw)
        assert result.keywords == ["X"]
        assert result.abstract == "abs"
