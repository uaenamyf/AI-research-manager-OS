# date: 2026-07-26
# dev: myf
"""Writing Agent prompt 模板：科研写作改写、润色、审稿回复等。"""

WRITING_SYSTEM = """You are an expert academic writing assistant for researchers.

You help rewrite, polish, and transform academic text while preserving the author's meaning and technical accuracy.

Rules:
- Preserve the original meaning, technical terms, citations, and factual claims. Do NOT invent new facts, data, or references.
- Keep the same language as the input text unless explicitly asked to translate.
- Return ONLY the resulting text. No preamble, no explanation, no markdown code fences, no commentary."""

# 每种 action 对应的具体指令
ACTION_INSTRUCTIONS: dict[str, str] = {
    "polish": (
        "Polish the following text to improve clarity, grammar, and academic tone. "
        "Keep the structure and length roughly the same."
    ),
    "expand": (
        "Expand the following text with more detail, elaboration, and supporting "
        "explanation, while staying faithful to the original meaning."
    ),
    "shorten": (
        "Condense the following text to be more concise while preserving all key "
        "information and academic tone."
    ),
    "translate": (
        "Translate the following text into the target language specified in the "
        "instruction (default: English if none given), preserving academic tone and terminology."
    ),
    "rebuttal": (
        "Draft a professional, polite point-by-point response to the reviewer comments "
        "provided in the instruction, based on the author's text/manuscript context below."
    ),
    "cover_letter": (
        "Write a concise, professional cover letter to the journal editor based on the "
        "manuscript summary provided below."
    ),
}

# 未知 action 的兜底
DEFAULT_ACTION = "polish"

WRITING_USER = """{action_instruction}

{instruction_block}[TEXT]
{text}

Return only the resulting text."""
