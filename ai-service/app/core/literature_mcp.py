# date: 2026-08-12
# dev: myf
"""literature-search-mcp 客户端封装：通过 stdio 调用学术文献检索 MCP。"""

import asyncio
import json

from loguru import logger

from app.core.config import settings


class LiteratureMcpError(Exception):
    """MCP 文献检索异常。"""


async def _call_tool(name: str, arguments: dict | None = None, timeout: float = 60.0):
    """启动 literature-search-mcp（node 子进程）并调用指定工具。"""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    server_params = StdioServerParameters(
        command="node",
        args=[settings.LITERATURE_MCP_SERVER],
    )
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await asyncio.wait_for(
                    session.call_tool(name, arguments or {}), timeout=timeout
                )
    except asyncio.TimeoutError as e:
        logger.error(f"literature_search MCP 调用超时（{timeout}s）")
        raise LiteratureMcpError("学术检索超时，请稍后重试") from e
    except Exception as e:  # noqa: BLE001
        logger.error(f"literature_search MCP 调用失败: {e}")
        raise LiteratureMcpError(f"学术检索服务不可用: {e}") from e


def _parse_json(result) -> dict:
    """从 CallToolResult.content[0].text 解析 JSON。"""
    text = result.content[0].text if result.content else ""
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:  # pragma: no cover - 防御性解析
        logger.error(f"literature_search 返回非 JSON: {text[:200]}")
        raise LiteratureMcpError("学术检索服务返回异常") from e


async def search_literature(
    query: str,
    limit: int = 10,
    sources: list[str] | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    open_access: bool | None = None,
    timeout: float = 90.0,
) -> dict:
    """检索学术文献（PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv）。

    返回 MCP 原始 SearchResponse（results + source_statuses + 汇总统计）。
    """
    arguments: dict = {"query": query, "limit": limit}
    if sources:
        arguments["sources"] = sources
    if year_from is not None:
        arguments["year_from"] = year_from
    if year_to is not None:
        arguments["year_to"] = year_to
    if open_access is not None:
        arguments["open_access"] = open_access

    result = await _call_tool("literature_search", arguments, timeout=timeout)
    return _parse_json(result)


async def list_sources(timeout: float = 30.0) -> dict:
    """列出支持的学术数据源及凭据配置状态。"""
    result = await _call_tool("literature_sources", timeout=timeout)
    return _parse_json(result)
