# date: 2026-07-10
# dev: myf
"""Backend 回调客户端：处理完成后回传结果给 backend。"""

import httpx
from loguru import logger

from app.core.config import settings


class BackendClient:
    """HTTP 客户端：回调 backend 的内部端点。

    所有回调带 X-Internal-Token 校验。
    """

    def __init__(self):
        self.base_url = settings.BACKEND_URL
        self.token = settings.INTERNAL_TOKEN
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(30.0),
                headers={"X-Internal-Token": self.token},
            )
        return self._client

    async def callback_paper_result(
        self,
        paper_id: int,
        summary: dict | None = None,
        status: str = "READY",
    ) -> bool:
        """回调：论文分析结果。

        Args:
            paper_id: 论文 ID
            summary: Paper Card 结构化数据（status=READY 时必填）
            status: READY 或 FAILED
        Returns:
            是否成功
        """
        client = await self._get_client()
        body: dict = {"status": status}
        if summary:
            body["summary"] = summary
        if status == "FAILED":
            body["error"] = "analysis failed"

        resp = await client.patch(f"/internal/paper/{paper_id}/result", json=body)
        success = resp.status_code == 200

        if success:
            logger.info(
                f"回调成功：paper_id={paper_id}, status={status}"
            )
        else:
            logger.error(
                f"回调失败：paper_id={paper_id}, "
                f"status_code={resp.status_code}, body={resp.text}"
            )

        return success

    async def callback_task_result(
        self,
        task_id: int,
        result: dict | None = None,
        status: str = "SUCCESS",
        error: str | None = None,
    ) -> bool:
        """回调：AI 任务结果（综述等）。

        Args:
            task_id: 任务 ID
            result: 结果数据（status=SUCCESS 时必填）
            status: SUCCESS 或 FAILED
            error: 错误信息（status=FAILED 时填）
        Returns:
            是否成功
        """
        client = await self._get_client()
        body: dict = {"status": status}
        if result:
            body["result"] = result
        if error:
            body["error"] = error

        resp = await client.patch(f"/internal/task/{task_id}/result", json=body)
        success = resp.status_code == 200

        if success:
            logger.info(f"回调成功：task_id={task_id}, status={status}")
        else:
            logger.error(
                f"回调失败：task_id={task_id}, "
                f"status_code={resp.status_code}, body={resp.text}"
            )

        return success

    async def close(self):
        """关闭 HTTP 客户端。"""
        if self._client:
            await self._client.aclose()
            self._client = None


# 全局单例
backend_client = BackendClient()
