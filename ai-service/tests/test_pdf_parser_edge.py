# date: 2026-07-23
# dev: myf
"""PDF 解析器边界条件测试."""
import os
import tempfile

import pytest
import fitz

from app.parser.pdf_parser import extract_text, split_by_section, parse_and_chunk


class TestPdfParserEdgeCases:
    """PDF 解析边界条件测试."""

    def test_extract_text_empty_pdf(self):
        """测试空 PDF 文件提取文本."""
        # 创建一个最小的空 PDF 文件
        empty_pdf_content = (
            b"%PDF-1.4\n"
            b"1 0 obj\n<< /Type /Catalog >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
            b"xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
            b"trailer\n<< /Size 3 /Root 1 0 R >>\n"
            b"startxref\n108\n%%EOF\n"
        )

        # 空 PDF 应该能处理但返回空内容
        result = extract_text(empty_pdf_content)
        assert result == ""

    def test_extract_text_invalid_pdf(self):
        """测试解析非 PDF 文件应该抛出异常."""
        # 创建一个文本文件伪装成 PDF
        non_pdf_content = b"This is not a PDF file"

        with pytest.raises(fitz.FileDataError):
            extract_text(non_pdf_content)

    def test_split_by_section_empty_text(self):
        """测试空文本章节切分."""
        result = split_by_section("")
        assert result == {"other": ""}

    def test_split_by_section_unknown_headers(self):
        """测试未知标题的文本全部归为 other."""
        text = "This is some random text\nWithout any section headers"
        result = split_by_section(text)
        assert "other" in result

    def test_parse_and_chunk_empty_pdf(self):
        """测试空 PDF 分块."""
        empty_pdf_content = (
            b"%PDF-1.4\n"
            b"1 0 obj\n<< /Type /Catalog >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
            b"xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
            b"trailer\n<< /Size 3 /Root 1 0 R >>\n"
            b"startxref\n108\n%%EOF\n"
        )
        chunks = parse_and_chunk(empty_pdf_content)
        assert chunks == []

    def test_special_characters_in_text(self):
        """测试包含特殊字符的文本处理."""
        special_text = (
            "Text with unicode: 中文 日本語 español 🎉\n"
            "Text with special chars: <>&@#$%^&*()\n"
        )

        sections = split_by_section(special_text)
        assert isinstance(sections, dict)
