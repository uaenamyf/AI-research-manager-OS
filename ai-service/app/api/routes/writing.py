# date: 2026-08-06
# dev: myf
"""Writing 路由：Writing Agent 文本改写端点（改写/润色/翻译/回复审稿人/Cover letter）。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.security import verify_internal_token
from app.llm.client import LLMOverride
from app.models import (
    WritingRewriteRequest,
    WritingRewriteResult,
)

router = APIRouter()


@router.post(
    "/rewrite",
    dependencies=[Depends(verify_internal_token)],
    response_model=WritingRewriteResult,
)
async def rewrite_text(req: WritingRewriteRequest) -> WritingRewriteResult:
    """同步改写文本（stateless）。

    backend WritingService 调用此端点，返回改写结果。
    ai-service 不持久化任何内容，纯文本转换。
    支持 llm_override：请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）。
    """
    from app.agents.writing_agent import rewrite

    # 2026-08-12 myf: 支持请求级 LLM 配置覆盖（用户自定义）
    llm_override = None
    if req.llm_override:
        llm_override = LLMOverride(
            provider=req.llm_override.provider,
            api_key=req.llm_override.api_key,
            base_url=req.llm_override.base_url,
            default_model=req.llm_override.default_model,
            temperature=req.llm_override.temperature,
        )

    result = await rewrite(req.text, req.action, req.instruction, llm_override)
    logger.info(f"Writing rewrite 完成：action={req.action}")
    return WritingRewriteResult(action=req.action, text=result)
