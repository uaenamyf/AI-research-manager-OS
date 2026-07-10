# date: 2026-07-10
# dev: myf
"""内部服务鉴权：校验 backend 请求头中的 X-Internal-Token。"""

from fastapi import Header, HTTPException, status

from app.core.config import settings


async def verify_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> str:
    """依赖注入：校验请求来自 backend。

    ai-service 所有端点必须挂此依赖，禁止直接对前端暴露。
    """
    if x_internal_token != settings.INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized internal call",
        )
    return x_internal_token
