# date: 2026-08-12
# dev: myf
"""文献检索路由：经 literature-search-mcp 搜索学术元数据提供商。"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.literature_mcp import LiteratureMcpError, search_literature
from app.core.security import verify_internal_token

router = APIRouter()


@router.get("/search", dependencies=[Depends(verify_internal_token)])
async def search(
    query: str = Query(..., min_length=1, description="文献检索表达式（arXiv 字段语法保留）"),
    limit: int = Query(10, ge=1, le=50, description="返回条数上限"),
    sources: str | None = Query(None, description="逗号分隔的数据源子集，空则全部"),
    year_from: int | None = Query(None, ge=1000, le=3000, description="起始年份（含）"),
    year_to: int | None = Query(None, ge=1000, le=3000, description="截止年份（含）"),
    open_access: bool | None = Query(None, description="仅保留开放获取/PDF 证据结果"),
):
    """检索学术文献并返回融合排序结果。"""
    source_list = [s.strip() for s in sources.split(",")] if sources else None
    if not query.strip():
        raise HTTPException(status_code=422, detail="检索关键词不能为空")
    try:
        return await search_literature(
            query=query,
            limit=limit,
            sources=source_list,
            year_from=year_from,
            year_to=year_to,
            open_access=open_access,
        )
    except LiteratureMcpError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
