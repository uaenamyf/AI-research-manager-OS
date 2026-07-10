# date: 2026-07-10
# dev: myf
"""Paper Agent：解析论文并生成 Paper Intelligence Card。"""

import json

from loguru import logger

from app.agents.prompts.paper_card import PAPER_CARD_SYSTEM, PAPER_CARD_USER
from app.llm.client import llm_client
from app.models.schemas import PaperAnalyzeResult


async def generate_paper_card(paper_text: str) -> PaperAnalyzeResult:
    """调用 LLM 生成 Paper Intelligence Card。

    Args:
        paper_text: 论文全文（或前 N 字符）
    Returns:
        PaperAnalyzeResult：结构化的论文摘要
    """
    # 截断超长文本，避免超出 token 限制（保守取前 12000 字符）
    truncated = paper_text[:12000]

    user_prompt = PAPER_CARD_USER.format(paper_text=truncated)

    logger.info("调用 LLM 生成 Paper Card...")
    raw = await llm_client.complete(
        system=PAPER_CARD_SYSTEM,
        user=user_prompt,
    )

    # 解析 JSON 响应（LLM 可能返回带 markdown 包裹的 JSON，做容错）
    result = _parse_json_response(raw)
    logger.info(f"Paper Card 生成完成：title={result.title[:50]}...")

    return result


def _parse_json_response(raw: str) -> PaperAnalyzeResult:
    """解析 LLM 返回的 JSON，容错处理 markdown 包裹。"""
    text = raw.strip()

    # 去除可能的 markdown 代码块包裹
    if text.startswith("```"):
        # 去掉 ```json 或 ``` 开头
        lines = text.split("\n")
        text = "\n".join(lines[1:])  # 去掉第一行
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"LLM 返回非 JSON，尝试提取: {text[:200]}")
        # 尝试找到 JSON 边界
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            data = json.loads(text[start : end + 1])
        else:
            logger.error("无法解析 LLM 返回为 JSON")
            data = {}

    # 映射到 schema，缺失字段用默认值
    return PaperAnalyzeResult(
        title=data.get("title", ""),
        authors=data.get("authors", ""),
        year=data.get("year"),
        doi=data.get("doi", ""),
        method=data.get("method", ""),
        finding=data.get("finding", ""),
        limitation=data.get("limitation", ""),
        future_work=data.get("future_work", ""),
    )
