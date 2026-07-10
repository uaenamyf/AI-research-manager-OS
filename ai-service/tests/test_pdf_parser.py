# date: 2026-07-10
# dev: myf
"""PDF 解析与 section 切分测试。"""

from app.parser.pdf_parser import (
    Chunk,
    detect_section,
    sliding_window,
    split_by_section,
)


def test_detect_section():
    """章节标题检测。"""
    assert detect_section("Abstract") == "abstract"
    assert detect_section("1. Introduction") == "introduction"
    assert detect_section("2. Methods") == "methods"
    assert detect_section("Materials and Methods") == "methods"
    assert detect_section("3. Results") == "results"
    assert detect_section("4. Discussion") == "discussion"
    assert detect_section("5. Conclusion") == "conclusion"
    assert detect_section("References") == "references"
    assert detect_section("Related Work") == "related_work"
    assert detect_section("This is a normal sentence.") is None


def test_split_by_section():
    """章节切分。"""
    text = """
Abstract
This paper presents a novel approach.

1. Introduction
Deep learning has achieved great success.

2. Methods
We use transformer architecture.

3. Results
Our model achieves 95% accuracy.

References
[1] Smith et al.
"""
    sections = split_by_section(text)

    assert "abstract" in sections
    assert "introduction" in sections
    assert "methods" in sections
    assert "results" in sections
    assert "references" in sections
    assert "novel approach" in sections["abstract"]
    assert "transformer" in sections["methods"]


def test_sliding_window_short():
    """短文本不切分。"""
    text = "This is a short text."
    chunks = sliding_window(text, size=512, overlap=64)
    assert len(chunks) == 1
    assert chunks[0] == "This is a short text."


def test_sliding_window_long():
    """长文本滑动窗口切分。"""
    text = "A" * 1000
    chunks = sliding_window(text, size=512, overlap=64)
    assert len(chunks) > 1
    # 每块不超过 size
    for c in chunks:
        assert len(c) <= 512


def test_sliding_window_empty():
    """空文本返回空列表。"""
    assert sliding_window("", size=512, overlap=64) == []
    assert sliding_window("   ", size=512, overlap=64) == []
