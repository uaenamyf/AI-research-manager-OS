# date: 2026-07-19
# dev: myf
"""Review 路由：综述生成端点。"""

from fastapi import APIRouter, Depends
from loguru import logger

from app.core.security import verify_internal_token
from app.models import ReviewGenerateRequest

router = APIRouter()


@router.post("/generate", dependencies=[Depends(verify_internal_token)])
async def generate_review(req: ReviewGenerateRequest):
    """同步生成综述（主要用于调试，正式流程走 MQ 异步消费）。

    正式流程：backend 发 MQ -> worker 消费 -> 回调 backend。
    此端点用于直接触发生成（如调试效果）。
    """
    from app.agents.review_agent import generate_review as agent_generate
    from app.core.db import get_db_pool

    pool = await get_db_pool()
    markdown = await agent_generate(pool, req.paper_ids, req.topic)
    return {"markdown": markdown}
