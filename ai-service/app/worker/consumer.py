# date: 2026-07-10
# dev: myf
"""RabbitMQ 消费者：消费 paper.analyze / review.generate 队列，处理异步任务。"""

import asyncio
import json
import traceback

import aio_pika
from loguru import logger

from app.core.backend_client import backend_client
from app.core.config import settings


class TaskConsumer:
    """RabbitMQ 消费者：消费 AI 任务消息，编排处理流程。

    消费队列：
    - q.paper.analyze   -> PDF 解析 + embedding + paper_agent
    - q.review.generate -> review_agent（Sprint 3.1 实现）
    - q.paper.cleanup   -> paper.delete 消息清理 PG paper_chunk
    """

    # 队列由 backend 创建（passive=True 只检查不创建），
    # 若 backend 尚未启动，后台任务持续重试，避免启动顺序导致永久不消费
    _QUEUE_RETRY_INTERVAL = 10

    def __init__(self):
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.RobustChannel | None = None
        self._consuming = False
        self._retry_task: asyncio.Task | None = None

    async def connect(self):
        """建立 RabbitMQ 连接，并启动队列就绪重试任务。"""
        logger.info("连接 RabbitMQ...")

        self._connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        self._channel = await self._connection.channel()

        # 设置 prefetch，避免一次拉太多
        await self._channel.set_qos(prefetch_count=1)

        self._consuming = True
        # 后台任务：声明队列（backend 创建）并开始消费；未就绪则持续重试
        self._retry_task = asyncio.create_task(self._ensure_consumers())

    async def _ensure_consumers(self):
        """循环尝试声明队列并消费，直到成功（backend 就绪）或连接关闭。"""
        while self._consuming:
            try:
                await self._declare_and_consume()
                return
            except Exception as e:
                logger.warning(
                    f"队列未就绪（backend 可能未启动），"
                    f"{self._QUEUE_RETRY_INTERVAL}s 后重试：{e}"
                )
                await asyncio.sleep(self._QUEUE_RETRY_INTERVAL)

    async def _declare_and_consume(self):
        """声明队列（与 backend RabbitConfig 参数一致，含 DLQ 配置）。

        passive=True 表示只检查队列是否存在，不创建（由 backend 负责创建）。
        """
        paper_queue = await self._channel.declare_queue(
            "q.paper.analyze", durable=True, passive=True
        )
        review_queue = await self._channel.declare_queue(
            "q.review.generate", durable=True, passive=True
        )
        paper_delete_queue = await self._channel.declare_queue(
            "q.paper.cleanup", durable=True, passive=True
        )

        # 开始消费
        await paper_queue.consume(self._on_paper_message)
        await review_queue.consume(self._on_review_message)
        await paper_delete_queue.consume(self._on_paper_delete_message)
        logger.info(
            "MQ 消费者已启动：监听 q.paper.analyze, q.review.generate, q.paper.cleanup"
        )

    async def disconnect(self):
        """关闭连接。"""
        self._consuming = False
        if self._retry_task:
            self._retry_task.cancel()
            self._retry_task = None
        if self._connection:
            await self._connection.close()
            self._connection = None
            logger.info("MQ 连接已关闭")

    async def _on_paper_delete_message(
        self, message: aio_pika.abc.AbstractIncomingMessage
    ):
        """处理 paper.delete 消息：清理 PG paper_chunk（跨库最终一致）。

        消息体格式（与 backend PaperServiceImpl.deletePaper 对齐）：
        { "taskId": 123, "type": "PAPER_DELETE", "payload": { "paperId": 1024 } }

        幂等：chunk 不存在时删除无副作用；无需回调 backend（MySQL 记录已删）。
        """
        async with message.process(requeue=False):
            try:
                msg = json.loads(message.body.decode())
                paper_id = msg["payload"]["paperId"]

                from app.core.db import get_db_pool
                from app.rag.vector_store import VectorStore

                pool = await get_db_pool()
                store = VectorStore(pool)
                deleted = await store.delete_by_paper(paper_id)
                logger.info(
                    f"论文删除清理完成：paper_id={paper_id}, 删除 {deleted} 个 chunk"
                )
            except Exception as e:
                logger.error(
                    f"清理论文向量失败：{e}\n{traceback.format_exc()}"
                )
                # 不 requeue，避免无限重试；chunk 残留可通过重跑清理（幂等）

    async def _on_paper_message(self, message: aio_pika.abc.AbstractIncomingMessage):
        """处理 paper.analyze 消息。

        消息体格式（与 backend AiTaskMessage 对齐）：
        { "taskId": 123, "type": "PAPER_ANALYSIS", "payload": { "paperId": 1024, "pdfUrl": "papers/xxx" } }
        """
        async with message.process(requeue=False):
            try:
                msg = json.loads(message.body.decode())
                paper_id = msg["payload"]["paperId"]
                pdf_url = msg["payload"]["pdfUrl"]

                logger.info(
                    f"收到论文分析任务：paperId={paper_id}, pdfUrl={pdf_url}"
                )

                await self._process_paper(paper_id, pdf_url)

            except Exception as e:
                logger.error(f"处理论文消息失败：{e}\n{traceback.format_exc()}")
                # 回调 backend 标记失败
                try:
                    paper_id = msg.get("payload", {}).get("paperId", 0)
                    if paper_id:
                        await backend_client.callback_paper_result(
                            paper_id, status="FAILED"
                        )
                except Exception:
                    pass
                # 不 requeue，避免无限重试（DLQ 由 RabbitMQ 配置处理）

    async def _on_review_message(self, message: aio_pika.abc.AbstractIncomingMessage):
        """处理 review.generate 消息。

        消息体格式（与 backend AiTaskMessage 对齐）：
        { "taskId": 123, "type": "REVIEW_GENERATION", "payload": { "paperIds": [1,2], "topic": "...", "llmOverride": {...} } }
        """
        async with message.process(requeue=False):
            msg = None
            try:
                msg = json.loads(message.body.decode())
                task_id = msg["taskId"]
                paper_ids = msg["payload"]["paperIds"]
                topic = msg["payload"].get("topic", "")
                # 2026-08-12 myf: 透传用户自定义 LLM 配置（backend 在 MQ 消息中携带）
                llm_override = msg["payload"].get("llmOverride")

                logger.info(
                    f"收到综述生成任务：taskId={task_id}, "
                    f"paperIds={paper_ids}, topic='{topic[:50]}', "
                    f"llmOverride={bool(llm_override)}"
                )

                await self._process_review(task_id, paper_ids, topic, llm_override)

            except Exception as e:
                logger.error(f"处理综述消息失败：{e}\n{traceback.format_exc()}")
                # 回调 backend 标记失败
                try:
                    if msg:
                        task_id = msg.get("taskId", 0)
                        if task_id:
                            await backend_client.callback_task_result(
                                task_id, status="FAILED", error=str(e)
                            )
                except Exception:
                    pass

    async def _process_review(
        self,
        task_id: int,
        paper_ids: list[int],
        topic: str,
        llm_override: dict | None = None,
    ):
        """综述生成全流程编排。

        步骤：
        1. 查询论文 Paper Card + 跨论文 RAG 检索
        2. LLM 生成 Markdown 综述
        3. 回调 backend
        """
        from app.agents.review_agent import generate_review
        from app.core.db import get_db_pool
        from app.llm.client import LLMOverride

        pool = await get_db_pool()

        # 2026-08-12 myf: 应用用户自定义 LLM 配置（MQ payload 中携带）
        override = LLMOverride.from_dict(llm_override)

        # 1-2. 生成综述
        markdown = await generate_review(pool, paper_ids, topic, override=override)

        # 3. 回调 backend
        result = {"markdown": markdown}
        try:
            await backend_client.callback_task_result(
                task_id, result=result, status="SUCCESS"
            )
        except Exception as cb_err:
            logger.warning(
                f"回调 backend 失败（task_id={task_id}），"
                f"综述已生成但结果未回传：{cb_err}"
            )

        logger.info(f"综述生成完成：task_id={task_id}")

    async def _process_paper(self, paper_id: int, pdf_url: str):
        """论文分析全流程编排。

        步骤：
        1. 下载 PDF（目前 pdf_url 是 S3 key，需用 httpx 下载）
        2. PDF 解析 + section 切分
        3. embedding + 写入 paper_chunk
        4. paper_agent 生成 Paper Card
        5. 回调 backend
        """
        # 延迟导入，避免循环依赖
        from app.parser.pdf_parser import parse_and_chunk
        from app.rag.embedding import embedding_service
        from app.rag.vector_store import VectorStore
        from app.agents.paper_agent import generate_paper_card
        from app.core.db import get_db_pool

        pool = await get_db_pool()

        # 1. 下载 PDF
        pdf_bytes = await self._download_pdf(pdf_url)
        if not pdf_bytes:
            await backend_client.callback_paper_result(
                paper_id, status="FAILED"
            )
            return

        # 2. PDF 解析 + section 切分
        chunks = parse_and_chunk(pdf_bytes)
        if not chunks:
            logger.warning(f"PDF 解析无内容：paper_id={paper_id}")
            await backend_client.callback_paper_result(
                paper_id, status="FAILED"
            )
            return

        # 3. embedding + 写入 paper_chunk
        texts = [c.content for c in chunks]
        embeddings = await embedding_service.embed_batch(texts)

        store = VectorStore(pool)
        chunk_data = [
            (c.section, c.content, emb)
            for c, emb in zip(chunks, embeddings, strict=True)
        ]
        await store.insert_chunks(paper_id, chunk_data)

        # 4. paper_agent 生成 Paper Card（用全文，不只用 chunk）
        from app.parser.pdf_parser import extract_text

        full_text = extract_text(pdf_bytes)
        card = await generate_paper_card(full_text)

        # 5. 回调 backend（失败不影响已完成的处理，只记日志）
        summary = card.model_dump()
        try:
            await backend_client.callback_paper_result(
                paper_id, summary=summary, status="READY"
            )
        except Exception as cb_err:
            logger.warning(
                f"回调 backend 失败（paper_id={paper_id}），"
                f"分析已完成但结果未回传：{cb_err}"
            )

        logger.info(f"论文分析完成：paper_id={paper_id}")

    async def _download_pdf(self, pdf_url: str) -> bytes | None:
        """下载 PDF 文件。

        支持三种来源：
        1. 本地绝对路径（开发期测试用，直接读文件）
        2. HTTP(S) URL（生产 S3 presigned URL）
        3. S3 相对 key（如 "papers/uuid/filename.pdf"）：
           拼接 backend 的 /api/files/{key} 下载。
           local 模式该端点直接读 backend/uploads 文件；
           S3 模式该端点 302 重定向 presigned URL（httpx 自动跟随）。
        """
        import os

        from app.core.config import settings

        # 1. 本地绝对路径
        if os.path.exists(pdf_url):
            with open(pdf_url, "rb") as f:
                return f.read()

        # 2. HTTP(S) URL
        if pdf_url.startswith("http"):
            import httpx

            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(pdf_url, timeout=60.0)
                if resp.status_code == 200:
                    return resp.content
                logger.error(f"下载 PDF 失败：{pdf_url}, status={resp.status_code}")
                return None

        # 3. S3 相对 key：经 backend /api/files/{key} 下载
        import urllib.parse

        headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}
        key = pdf_url.lstrip("/")
        encoded_key = urllib.parse.quote(key, safe="/")
        download_url = f"{settings.BACKEND_URL}/api/files/{encoded_key}"
        logger.info(f"经 backend 下载 PDF：{download_url}")

        import httpx

        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(download_url, headers=headers, timeout=60.0)
            if resp.status_code == 200:
                return resp.content
            logger.error(f"下载 PDF 失败：{download_url}, status={resp.status_code}")
            return None


# 全局单例
task_consumer = TaskConsumer()
