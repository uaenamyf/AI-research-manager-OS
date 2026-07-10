# date: 2026-07-10
# dev: myf
"""Paper 路由：论文分析端点。"""

from fastapi import APIRouter, Depends

from app.core.security import verify_internal_token
from app.models import PaperAnalyzeRequest

router = APIRouter()


@router.post("/analyze", dependencies=[Depends(verify_internal_token)])
async def analyze_paper(req: PaperAnalyzeRequest):
    """同步分析论文（主要用于调试，正式流程走 MQ 异步消费）。

    正式流程：backend 发 MQ -> worker 消费 -> 回调 backend。
    此端点用于直接触发分析（如调试 PDF 解析、embedding 效果）。
    """
    from app.worker.consumer import task_consumer

    # 直接调用处理流程（不经过 MQ）
    await task_consumer._process_paper(req.paper_id, req.pdf_url)
    return {"status": "ok", "paperId": req.paper_id}
