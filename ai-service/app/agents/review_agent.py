# date: 2026-07-26
# dev: myf
"""Review Agent：多篇论文综述（Literature Review）生成。"""

import asyncpg
from loguru import logger

from app.agents.prompts.review import REVIEW_SYSTEM, REVIEW_USER
from app.llm.client import llm_client
from app.rag.embedding import embedding_service
from app.rag.vector_store import VectorStore

# 综述检索的片段数量（跨论文）
_REVIEW_TOP_K = 12
# 单篇论文摘要注入的最大字符数，防止 token 超限
_SUMMARY_MAX_CHARS = 1500


async def generate_review(
    pool: asyncpg.Pool,
    paper_ids: list[int],
    topic: str,
    override=None,
) -> str:
    """生成 Literature Review。

    流程：
    1. 只读 paper 表 metadata（title/authors/year/summary）构造论文清单
    2. 跨论文 RAG 检索与 topic 最相关的片段作为证据
    3. LLM 生成结构化 Markdown 综述

    约束：ai-service 只读 paper metadata 与 paper_chunk，不写业务表。

    Args:
        pool: 数据库连接池
        paper_ids: 论文 ID 列表
        topic: 综述主题
        override: 请求级 LLM 配置覆盖（用户自定义 API Key / 模型等），None 用系统默认
    Returns:
        Markdown 格式的综述文本
    """
    if not paper_ids:
        logger.warning("综述生成：paper_ids 为空")
        return "# Literature Review\n\n(No papers provided.)"

    # 1. 读取论文 metadata（只读，符合服务边界）
    papers = await _fetch_paper_metadata(pool, paper_ids)
    if not papers:
        logger.warning(f"综述生成：未找到论文 metadata，paper_ids={paper_ids}")
        return "# Literature Review\n\n(No paper metadata found.)"

    # 为每篇论文分配引用标记 [P1], [P2]...，并记录 marker -> paper_id
    marker_map: dict[int, str] = {}
    for idx, p in enumerate(papers, start=1):
        marker_map[p["id"]] = f"P{idx}"

    papers_block = _build_papers_block(papers, marker_map)

    # 2. 跨论文 RAG 检索证据片段（保留 paper_id 以标注来源）
    query = topic.strip() or "core methods, findings and limitations"
    store = VectorStore(pool)
    query_embedding = await embedding_service.embed_one(query)
    chunks = await store.search_multi(paper_ids, query_embedding, top_k=_REVIEW_TOP_K)
    excerpts_block = _build_excerpts_block(chunks, marker_map)

    # 3. LLM 生成综述
    user_prompt = REVIEW_USER.format(
        topic=topic or "(no specific topic; synthesize the common themes)",
        papers_block=papers_block,
        excerpts_block=excerpts_block,
    )

    logger.info(
        f"综述生成：papers={len(papers)}, 检索片段={len(chunks)}, "
        f"topic='{topic[:50]}'"
    )
    # 2026-08-12 myf: 支持用户自定义 LLM 配置覆盖
    markdown = await llm_client.complete(
        system=REVIEW_SYSTEM, user=user_prompt, override=override
    )

    result = _strip_code_fence(markdown)
    logger.info(f"综述生成完成，长度={len(result)} 字符")
    return result


async def _fetch_paper_metadata(
    pool: asyncpg.Pool,
    paper_ids: list[int],
) -> list[dict]:
    """只读 paper 表 metadata，按传入顺序返回。"""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, authors, year, summary
            FROM paper
            WHERE id = ANY($1::bigint[])
            """,
            paper_ids,
        )

    by_id = {row["id"]: row for row in rows}
    ordered: list[dict] = []
    for pid in paper_ids:
        row = by_id.get(pid)
        if row is None:
            continue
        ordered.append(
            {
                "id": row["id"],
                "title": row["title"] or "(untitled)",
                "authors": row["authors"] or "",
                "year": row["year"],
                "summary": row["summary"],
            }
        )
    return ordered


def _build_papers_block(papers: list[dict], marker_map: dict[int, str]) -> str:
    """构造论文清单文本块，含引用标记与 Paper Card 摘要。"""
    parts: list[str] = []
    for p in papers:
        marker = marker_map[p["id"]]
        year = p["year"] if p["year"] is not None else "n.d."
        header = f"[{marker}] {p['title']} — {p['authors']} ({year})"

        summary_text = _format_summary(p["summary"])
        if summary_text:
            parts.append(f"{header}\n{summary_text}")
        else:
            parts.append(header)
    return "\n\n".join(parts)


def _format_summary(summary) -> str:
    """将 paper.summary（JSONB，可能是 dict 或 JSON 字符串）格式化为文本。"""
    if not summary:
        return ""

    # asyncpg 对 JSONB 默认返回字符串，需要解析
    data = summary
    if isinstance(summary, str):
        import json

        try:
            data = json.loads(summary)
        except json.JSONDecodeError:
            return summary[:_SUMMARY_MAX_CHARS]

    if not isinstance(data, dict):
        return str(data)[:_SUMMARY_MAX_CHARS]

    fields = [
        ("Method", data.get("method")),
        ("Finding", data.get("finding")),
        ("Limitation", data.get("limitation")),
        ("Future work", data.get("future_work")),
    ]
    lines = [f"  - {label}: {value}" for label, value in fields if value]
    text = "\n".join(lines)
    return text[:_SUMMARY_MAX_CHARS]


def _build_excerpts_block(
    chunks: list[dict],
    marker_map: dict[int, str],
) -> str:
    """构造检索片段文本块，按来源论文标记与 section 标注（RAG 带来源）。

    Args:
        chunks: search_multi 返回的 [{id, paper_id, section, content, score}, ...]
        marker_map: paper_id -> 引用标记（如 "P1"）
    """
    if not chunks:
        return "(No relevant excerpts retrieved.)"

    parts: list[str] = []
    for c in chunks:
        marker = marker_map.get(c["paper_id"], "?")
        parts.append(
            f"[{marker} | Section: {c['section']} | chunk_id={c['id']}]\n{c['content']}"
        )
    return "\n\n---\n\n".join(parts)


def _strip_code_fence(text: str) -> str:
    """去除 LLM 可能包裹的 markdown 代码块围栏。"""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        lines = lines[1:]  # 去掉 ``` 或 ```markdown 开头
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped
