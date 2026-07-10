# date: 2026-07-10
# dev: myf
"""数据库连接池访问：从 app.state 获取全局连接池。"""

import asyncpg


# 全局引用（由 main.py lifespan 设置）
_db_pool: asyncpg.Pool | None = None


def set_db_pool(pool: asyncpg.Pool):
    """设置全局数据库连接池（应用启动时调用）。"""
    global _db_pool
    _db_pool = pool


async def get_db_pool() -> asyncpg.Pool:
    """获取全局数据库连接池。

    worker/consumer 等非请求上下文通过此函数获取连接池。
    """
    if _db_pool is None:
        raise RuntimeError("数据库连接池未初始化")
    return _db_pool
