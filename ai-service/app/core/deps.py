# date: 2026-07-10
# dev: myf
"""依赖注入：数据库连接池、HTTP 客户端等共享资源。"""

from typing import AsyncIterator

import asyncpg
from fastapi import Request


async def get_db_pool(request: Request) -> AsyncIterator[asyncpg.Pool]:
    """获取全局向量库连接池（PostgreSQL，应用启动时初始化）。"""
    pool: asyncpg.Pool = request.app.state.db_pool
    if pool is None:
        raise RuntimeError("向量库连接池未初始化")
    yield pool
