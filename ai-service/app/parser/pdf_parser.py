# date: 2026-07-10
# dev: myf
"""PDF 解析 + section 切分：PyMuPDF 提取文本，按学术论文结构分块。"""

import re
from dataclasses import dataclass

import fitz  # PyMuPDF
from loguru import logger

from app.core.config import settings


@dataclass
class Chunk:
    """论文分块。"""

    section: str
    content: str


# 论文章节正则模式（不区分大小写）
SECTION_PATTERNS: dict[str, re.Pattern] = {
    "abstract": re.compile(r"^\s*abstract\b", re.IGNORECASE),
    "introduction": re.compile(r"^\s*\d?\.?\s*introduction\b", re.IGNORECASE),
    "methods": re.compile(
        r"^\s*\d?\.?\s*(methods?|materials\s+and\s+methods)\b", re.IGNORECASE
    ),
    "results": re.compile(
        r"^\s*\d?\.?\s*(results?|experiments?|evaluation)\b", re.IGNORECASE
    ),
    "discussion": re.compile(r"^\s*\d?\.?\s*discussion\b", re.IGNORECASE),
    "conclusion": re.compile(r"^\s*\d?\.?\s*conclusion\b", re.IGNORECASE),
    "references": re.compile(r"^\s*\d?\.?\s*references?\b", re.IGNORECASE),
    "related_work": re.compile(
        r"^\s*\d?\.?\s*(related\s+work|background)\b", re.IGNORECASE
    ),
}


def extract_text(pdf_bytes: bytes) -> str:
    """从 PDF 字节流提取纯文本。

    Args:
        pdf_bytes: PDF 文件内容
    Returns:
        提取的全文文本
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    text_parts: list[str] = []

    for page_num in range(page_count):
        page = doc[page_num]
        text = page.get_text("text")
        if text:
            text_parts.append(text)

    doc.close()
    full_text = "\n".join(text_parts)
    logger.debug(f"PDF 提取完成：{page_count} 页，{len(full_text)} 字符")
    return full_text


def detect_section(line: str) -> str | None:
    """检测一行是否是章节标题，返回 section 名或 None。"""
    for section, pattern in SECTION_PATTERNS.items():
        if pattern.match(line):
            return section
    return None


def split_by_section(text: str) -> dict[str, str]:
    """按章节标题切分文本。

    Args:
        text: 全文文本
    Returns:
        {section: content} 字典
    """
    sections: dict[str, str] = {}
    current_section = "other"
    current_lines: list[str] = []

    for line in text.split("\n"):
        detected = detect_section(line)
        if detected:
            # 保存上一个 section
            if current_lines:
                sections[current_section] = "\n".join(current_lines).strip()
            current_section = detected
            current_lines = []
        else:
            current_lines.append(line)

    # 保存最后一个 section
    if current_lines:
        sections[current_section] = "\n".join(current_lines).strip()

    logger.debug(f"章节切分完成：{list(sections.keys())}")
    return sections


def sliding_window(
    text: str, size: int = 512, overlap: int = 64
) -> list[str]:
    """滑动窗口切分长文本。

    Args:
        text: 输入文本
        size: 每块字符数
        overlap: 重叠字符数
    Returns:
        切分后的文本块列表
    """
    if len(text) <= size:
        return [text] if text.strip() else []

    chunks: list[str] = []
    start = 0
    step = size - overlap

    while start < len(text):
        end = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += step

    return chunks


def parse_and_chunk(pdf_bytes: bytes) -> list[Chunk]:
    """解析 PDF 并按章节 + 滑动窗口切分。

    Args:
        pdf_bytes: PDF 文件内容
    Returns:
        Chunk 列表（section + content）
    """
    text = extract_text(pdf_bytes)
    sections = split_by_section(text)
    chunks: list[Chunk] = []

    for section, content in sections.items():
        if not content:
            continue
        # references 不做切分，跳过
        if section == "references":
            continue

        pieces = sliding_window(
            content, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP
        )
        for piece in pieces:
            chunks.append(Chunk(section=section, content=piece))

    logger.info(f"PDF 解析完成：{len(chunks)} 个 chunk")
    return chunks
