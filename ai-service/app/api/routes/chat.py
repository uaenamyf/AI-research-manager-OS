# date: 2026-07-15
# dev: myf
"""Chat 路由：Paper Chat SSE 流式问答。"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from loguru import logger

from app.core.security import verify_internal_token
from app.models import ChatStreamRequest
from app.rag.retriever import Retriever
from app.rag.vector_store import VectorStore
from app.core.db import get_db_pool

router = APIRouter()


@router.post(
    "/chat/stream",
    dependencies=[Depends(verify_internal_token)],
    response_class=StreamingResponse,
)
async def chat_stream(req: ChatStreamRequest):
    """流式问答（SSE）。

    backend ChatService.forwardStream 调用此端点，转发 token 到前端。

    SSE 事件格式：
    - data: {"type":"citations","ids":[1,2,3]}  # 引用 chunk_id
    - data: {"type":"token","content":"hello"}  # 逐 token 回答
    - data: {"type":"done"}                      # 流结束
    """
    from app.agents.chat_agent import chat_stream as agent_stream
    from app.llm.client import LLMOverride

    # 2026-08-12 myf: 解析请求级 LLM 配置覆盖（用户自定义 API Key / 模型等）
    llm_override = None
    if req.llm_override:
        llm_override = LLMOverride(
            provider=req.llm_override.provider,
            api_key=req.llm_override.api_key,
            base_url=req.llm_override.base_url,
            default_model=req.llm_override.default_model,
            temperature=req.llm_override.temperature,
        )

    async def event_generator():
        """生成 SSE 事件流。"""
        try:
            # 获取数据库连接池，创建检索器
            pool = await get_db_pool()
            vector_store = VectorStore(pool)
            retriever = Retriever(vector_store)

            # 1. 先检索（为了拿到 citations），使用用户自定义检索参数
            chunks = await retriever.retrieve(
                req.paper_id,
                req.question,
                top_k=req.retrieve_top_k or 0,
                similarity_threshold=req.similarity_threshold,
            )
            citation_ids = [c.id for c in chunks]

            # 发送 citation 事件
            citation_event = json.dumps(
                {"type": "citation", "citations": citation_ids}
            )
            yield f"data: {citation_event}\n\n"

            # 2. 构造 context + LLM 流式生成
            from app.agents.chat_agent import build_context
            from app.agents.prompts.chat import CHAT_SYSTEM, CHAT_USER
            from app.llm.client import llm_client

            context = build_context(chunks)
            user_prompt = CHAT_USER.format(context=context, question=req.question)

            logger.info(
                f"Chat 生成：paper_id={req.paper_id}, "
                f"citations={citation_ids}"
            )

            async for token in llm_client.stream(
                system=CHAT_SYSTEM,
                user=user_prompt,
                override=llm_override,
            ):
                token_event = json.dumps({"type": "token", "content": token})
                yield f"data: {token_event}\n\n"

            # 发送结束事件
            yield f'data: {json.dumps({"type": "done"})}\n\n'

        except Exception as e:
            logger.error(f"Chat 流生成失败：{e}")
            error_event = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {error_event}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
