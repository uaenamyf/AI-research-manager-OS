# date: 2026-08-06
# dev: myf
"""Writing 路由：Writing Agent 文本变换端点（改写/润色/回复审稿人/Cover letter）。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.security import verify_internal_token
from app.models import WritingTransformRequest, WritingTransformResponse

router = APIRouter()


@router.post(
    "/transform",
    response_model=WritingTransformResponse,
    dependencies=[Depends(verify_internal_token)],
)
async def transform(req: WritingTransformRequest):
    """文本变换（同步）。

    action 支持：rewrite（改写）/ polish（润色）/
    review_response（回复审稿人）/ cover_letter（Cover letter）。
    """
    from app.agents.writing_agent import transform_text

    result = await transform_text(req.text, req.action)
    logger.info(f"Writing 变换：action='{req.action}', 输出 {len(result)} 字符")
    return WritingTransformResponse(result=result)
