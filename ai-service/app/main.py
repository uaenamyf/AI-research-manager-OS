# date: 2026-07-10
# dev: myf
"""FastAPI 应用入口：路由注册、生命周期、健康检查。"""

from contextlib import asynccontextmanager
from urllib.parse import urlparse

import aiomysql
import aiomysql.cursors
import asyncpg
from fastapi import FastAPI
from loguru import logger

from app.api.routes import chat, graph, literature, paper, review, search, writing
from app.api.routes.recommend import router as recommend_router
from app.api.routes.latex import router as latex_router
from app.core.backend_client import backend_client
from app.core.config import settings
from app.core.db import set_db_pool, set_meta_pool
from app.models import HealthResponse
from app.worker.consumer import task_consumer


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化资源，关闭时释放。"""
    # ── 启动 ──
    logger.info("启动 ai-service...")
    logger.info(f"DATABASE_URL={settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"MYSQL_URL={settings.MYSQL_URL.split('@')[-1]}")
    logger.info(f"LLM_PROVIDER={settings.LLM_PROVIDER}")

    # 向量库连接池（PostgreSQL + pgvector：paper_chunk）
    app.state.db_pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
        min_size=2,
        max_size=10,
    )
    set_db_pool(app.state.db_pool)
    logger.info("向量库连接池已初始化（PostgreSQL）")

    # 业务元数据库连接池（MySQL：只读 paper 元数据）
    _u = urlparse(settings.MYSQL_URL)
    app.state.meta_pool = await aiomysql.create_pool(
        host=_u.hostname,
        port=_u.port or 3306,
        user=_u.username,
        password=_u.password,
        db=_u.path.lstrip("/"),
        charset="utf8mb4",
        autocommit=True,
        minsize=2,
        maxsize=5,
        cursorclass=aiomysql.cursors.DictCursor,
    )
    set_meta_pool(app.state.meta_pool)
    logger.info("业务元数据库连接池已初始化（MySQL）")

    # MQ 消费者
    await task_consumer.connect()

    yield

    # ── 关闭 ──
    await task_consumer.disconnect()
    await backend_client.close()
    if hasattr(app.state, "meta_pool") and app.state.meta_pool:
        app.state.meta_pool.close()
        await app.state.meta_pool.wait_closed()
        logger.info("业务元数据库连接池已关闭")
    if hasattr(app.state, "db_pool") and app.state.db_pool:
        await app.state.db_pool.close()
        logger.info("向量库连接池已关闭")

    logger.info("ai-service 已停止")


app = FastAPI(
    title="ResearchOS AI Service",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查端点（无需鉴权，供 K8s/Docker 探活）。"""
    return HealthResponse(status="ok", version="0.1.0")


# ── 路由注册 ──
# 所有业务路由都挂内部鉴权依赖（在路由模块内声明）
app.include_router(paper.router, prefix="/paper", tags=["paper"])
app.include_router(chat.router, prefix="/rag", tags=["rag"])
app.include_router(review.router, prefix="/review", tags=["review"])
app.include_router(search.router, tags=["search"])
app.include_router(writing.router, prefix="/writing", tags=["writing"])
app.include_router(graph.router, prefix="/graph", tags=["graph"])
app.include_router(literature.router, prefix="/literature", tags=["literature"])
app.include_router(recommend_router, prefix="/rag", tags=["rag"])
app.include_router(latex_router, tags=["latex"])
