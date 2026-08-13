# date: 2026-07-10
# dev: myf
"""数据库连接池访问：从 app.state 获取全局连接池。

双库架构：
- 向量库（PostgreSQL + pgvector）：paper_chunk 表，asyncpg 连接池（主池）
- 业务元数据库（MySQL）：paper 表只读，aiomysql 连接池（元数据池）
"""

import aiomysql
import asyncpg


# 全局引用（由 main.py lifespan 设置）
_db_pool: asyncpg.Pool | None = None
_meta_pool: aiomysql.Pool | None = None


def set_db_pool(pool: asyncpg.Pool):
    """设置全局向量库连接池（应用启动时调用）。"""
    global _db_pool
    _db_pool = pool


def set_meta_pool(pool: aiomysql.Pool):
    """设置全局业务元数据库连接池（MySQL，应用启动时调用）。"""
    global _meta_pool
    _meta_pool = pool


async def get_db_pool() -> asyncpg.Pool:
    """获取全局向量库连接池（PostgreSQL）。

    worker/consumer 等非请求上下文通过此函数获取连接池。
    """
    if _db_pool is None:
        raise RuntimeError("向量库连接池未初始化")
    return _db_pool


async def get_meta_pool() -> aiomysql.Pool:
    """获取全局业务元数据库连接池（MySQL）。"""
    if _meta_pool is None:
        raise RuntimeError("业务元数据库连接池未初始化")
    return _meta_pool
