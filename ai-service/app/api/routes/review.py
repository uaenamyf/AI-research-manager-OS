# date: 2026-07-10
# dev: myf
"""Review 路由：综述生成端点。"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_internal_token
from app.models import ReviewGenerateRequest

router = APIRouter()


@router.post("/generate", dependencies=[Depends(verify_internal_token)])
async def generate_review(req: ReviewGenerateRequest):
    """同步生成综述（主要用于调试，正式流程走 MQ 异步消费）。

    Sprint 3.1 实现：review_agent + 回调 backend。
    """
    # TODO Sprint 3.1: 调用 review_agent 生成综述
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="review generate not implemented yet (Sprint 3.1)",
    )
