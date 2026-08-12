# date: 2026-08-06
# dev: myf
"""Writing Agent：改写、润色、翻译、回复审稿人、Cover letter（科研版 Cursor）。"""

from loguru import logger

from app.agents.prompts.writing import (
    ACTION_INSTRUCTIONS,
    DEFAULT_ACTION,
    REWRITE_USER,
    WRITING_SYSTEM,
)
from app.llm.client import LLMOverride, llm_client

SUPPORTED_ACTIONS = tuple(ACTION_INSTRUCTIONS.keys())


async def rewrite(
    text: str,
    action: str = DEFAULT_ACTION,
    instruction: str = "",
    llm_override: LLMOverride | None = None,
) -> str:
    """按指定动作改写文本。

    stateless 纯文本转换，不查库、不做 RAG（符合 writing_agent 契约）。

    Args:
        text: 原始文本
        action: 改写动作（polish/expand/shorten/translate/rebuttal/cover_letter）
        instruction: 额外指令（如翻译目标语言、审稿意见）
        llm_override: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    Returns:
        改写后的文本
    """
    if not text or not text.strip():
        return ""

    normalized = action.strip().lower()
    if normalized not in ACTION_INSTRUCTIONS:
        logger.warning(f"未知改写动作 '{action}'，回退到 '{DEFAULT_ACTION}'")
        normalized = DEFAULT_ACTION

    action_instruction = ACTION_INSTRUCTIONS[normalized]

    instruction_block = ""
    if instruction and instruction.strip():
        instruction_block = f"[INSTRUCTION]\n{instruction.strip()}\n\n"

    user_prompt = REWRITE_USER.format(
        action_instruction=action_instruction,
        instruction_block=instruction_block,
        text=text,
    )

    logger.info(f"Writing 改写：action={normalized}, text_len={len(text)}")
    raw = await llm_client.complete(
        system=WRITING_SYSTEM, user=user_prompt, override=llm_override
    )

    result = _strip_code_fence(raw)
    logger.info(f"Writing 改写完成：result_len={len(result)}")
    return result


def _strip_code_fence(text: str) -> str:
    """去除 LLM 可能包裹的 markdown 代码块围栏。"""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        lines = lines[1:]  # 去掉 ``` 或 ```markdown 开头
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped
