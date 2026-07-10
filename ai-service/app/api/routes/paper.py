# date: 2026-07-10
# dev: myf
"""Paper 路由：论文分析端点。"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_internal_token
from app.models import PaperAnalyzeRequest

router = APIRouter()


@router.post("/analyze", dependencies=[Depends(verify_internal_token)])
async def analyze_paper(req: PaperAnalyzeRequest):
    """同步分析论文（主要用于调试，正式流程走 MQ 异步消费）。

    Sprint 2.5 实现：PDF 解析 + paper_agent + 回调 backend。
    """
    # TODO Sprint 2.5: 调用 paper_agent 完成分析
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="paper analyze not implemented yet (Sprint 2.3-2.5)",
    )
