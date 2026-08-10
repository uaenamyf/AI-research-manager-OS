# date: 2026-08-06
# dev: myf
"""Writing 路由：Writing Agent 文本改写端点（改写/润色/翻译/回复审稿人/Cover letter）。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.security import verify_internal_token
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
    """
    from app.agents.writing_agent import rewrite

    result = await rewrite(req.text, req.action, req.instruction)
    logger.info(f"Writing rewrite 完成：action={req.action}")
    return WritingRewriteResult(action=req.action, text=result)
