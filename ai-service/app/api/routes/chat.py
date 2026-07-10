# date: 2026-07-10
# dev: myf
"""Chat 路由：Paper Chat SSE 流式问答。"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.security import verify_internal_token
from app.models import ChatStreamRequest

router = APIRouter()


@router.post(
    "/chat/stream",
    dependencies=[Depends(verify_internal_token)],
    response_class=StreamingResponse,
)
async def chat_stream(req: ChatStreamRequest):
    """流式问答（SSE）。

    backend ChatService.forwardStream 调用此端点，转发 token 到前端。
    Sprint 2.8/2.9 实现：RAG 检索 + chat_agent + SSE 流。
    """
    # TODO Sprint 2.8: 调用 chat_agent 流式生成
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="chat stream not implemented yet (Sprint 2.8-2.9)",
    )
