# date: 2026-07-10
# dev: myf
"""统一 LLM 客户端：支持 openai/anthropic 切换，通过 LLM_PROVIDER 环境变量控制。"""

from typing import AsyncIterator

from loguru import logger

from app.core.config import settings


class LLMClient:
    """统一 LLM 接口，封装 openai 和 anthropic 两种 provider。"""

    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self._openai = None
        self._anthropic = None

    def _get_openai(self):
        if self._openai is None:
            from openai import AsyncOpenAI

            kwargs = {"api_key": settings.OPENAI_API_KEY}
            if settings.OPENAI_BASE_URL:
                kwargs["base_url"] = settings.OPENAI_BASE_URL
            self._openai = AsyncOpenAI(**kwargs)
        return self._openai

    def _get_anthropic(self):
        if self._anthropic is None:
            from anthropic import AsyncAnthropic

            self._anthropic = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._anthropic

    async def complete(self, system: str, user: str, model: str = "") -> str:
        """非流式补全，返回完整文本。

        Args:
            system: system prompt
            user: user prompt
            model: 模型名（空则用 provider 默认模型）
        """
        if self.provider == "openai":
            model = model or settings.OPENAI_DEFAULT_MODEL
            client = self._get_openai()
            resp = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return resp.choices[0].message.content or ""

        elif self.provider == "anthropic":
            model = model or "claude-sonnet-4-20250514"
            client = self._get_anthropic()
            resp = await client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return resp.content[0].text

        else:
            raise ValueError(f"不支持的 LLM_PROVIDER: {self.provider}")

    async def stream(
        self, system: str, user: str, model: str = ""
    ) -> AsyncIterator[str]:
        """流式补全，逐 token yield。

        Args:
            system: system prompt
            user: user prompt
            model: 模型名（空则用 provider 默认模型）
        """
        if self.provider == "openai":
            model = model or settings.OPENAI_DEFAULT_MODEL
            client = self._get_openai()
            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content

        elif self.provider == "anthropic":
            model = model or "claude-sonnet-4-20250514"
            client = self._get_anthropic()
            async with client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        else:
            raise ValueError(f"不支持的 LLM_PROVIDER: {self.provider}")


# 全局单例
llm_client = LLMClient()
