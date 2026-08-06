# date: 2026-08-06
# dev: myf
"""Writing Agent：改写、润色、回复审稿人、Cover letter（科研版 Cursor）。"""

from loguru import logger

from app.agents.prompts.writing import (
    WRITING_ACTION_INSTRUCTIONS,
    WRITING_DEFAULT_INSTRUCTION,
    WRITING_SYSTEM,
    WRITING_USER,
)
from app.llm.client import llm_client

SUPPORTED_ACTIONS = ("rewrite", "polish", "review_response", "cover_letter")


async def transform_text(text: str, action: str) -> str:
    """按 action 对文本进行改写/润色等变换。

    Args:
        text: 待处理文本
        action: 变换类型（rewrite/polish/review_response/cover_letter）
    Returns:
        变换后的文本
    """
    instruction = WRITING_ACTION_INSTRUCTIONS.get(
        action.lower().strip(), WRITING_DEFAULT_INSTRUCTION
    )
    user_prompt = WRITING_USER.format(instruction=instruction, text=text)

    logger.info(
        f"Writing 变换：action='{action}', 输入 {len(text)} 字符"
    )

    result = await llm_client.complete(
        system=WRITING_SYSTEM,
        user=user_prompt,
    )

    logger.info(f"Writing 变换完成：输出 {len(result)} 字符")
    return result
