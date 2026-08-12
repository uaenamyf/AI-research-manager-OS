# date: 2026-07-10
# dev: myf
"""统一 LLM 客户端：支持 openai/anthropic 切换，通过 LLM_PROVIDER 环境变量控制。"""

from typing import AsyncIterator

from loguru import logger

from app.core.config import settings


class LLMOverride:
    """请求级 LLM 配置覆盖（用户自定义 API Key / Base URL / 模型）。

    所有字段均可选，None 表示使用系统全局配置。
    """

    def __init__(
        self,
        provider: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        default_model: str | None = None,
        temperature: float | None = None,
    ):
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url
        self.default_model = default_model
        self.temperature = temperature

    @classmethod
    def from_dict(cls, data: dict | None) -> "LLMOverride | None":
        if not data:
            return None
        return cls(
            provider=data.get("provider"),
            api_key=data.get("api_key") or data.get("apiKey"),
            base_url=data.get("base_url") or data.get("baseUrl"),
            default_model=data.get("default_model") or data.get("defaultModel"),
            temperature=data.get("temperature"),
        )


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

    def _resolve_provider(self, override: LLMOverride | None) -> str:
        return (override and override.provider) or self.provider

    def _resolve_model(self, model: str, override: LLMOverride | None) -> str:
        if model:
            return model
        if override and override.default_model:
            return override.default_model
        provider = self._resolve_provider(override)
        if provider == "openai":
            return settings.OPENAI_DEFAULT_MODEL
        return "claude-sonnet-4-20250514"

    def _get_client_for_provider(self, provider: str, override: LLMOverride | None):
        """根据 provider 和 override 获取客户端。

        有 override 时创建临时客户端（用户自定义 key/url），否则用全局单例。
        """
        if override and (override.api_key or override.base_url):
            # 用户自定义配置，创建临时客户端
            if provider == "openai":
                from openai import AsyncOpenAI

                kwargs = {"api_key": override.api_key or settings.OPENAI_API_KEY}
                if override.base_url:
                    kwargs["base_url"] = override.base_url
                return AsyncOpenAI(**kwargs)
            elif provider == "anthropic":
                from anthropic import AsyncAnthropic

                return AsyncAnthropic(
                    api_key=override.api_key or settings.ANTHROPIC_API_KEY
                )
        # 无自定义配置，用全局单例
        if provider == "openai":
            return self._get_openai()
        elif provider == "anthropic":
            return self._get_anthropic()
        raise ValueError(f"不支持的 LLM provider: {provider}")

    async def complete(
        self,
        system: str,
        user: str,
        model: str = "",
        override: LLMOverride | None = None,
    ) -> str:
        """非流式补全，返回完整文本。

        Args:
            system: system prompt
            user: user prompt
            model: 模型名（空则用 provider 默认模型）
            override: 请求级 LLM 配置覆盖（用户自定义）
        """
        provider = self._resolve_provider(override)
        model = self._resolve_model(model, override)
        client = self._get_client_for_provider(provider, override)
        temperature = override.temperature if override else None

        if provider == "openai":
            kwargs: dict = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
            if temperature is not None:
                kwargs["temperature"] = temperature
            resp = await client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""

        elif provider == "anthropic":
            kwargs = {
                "model": model,
                "max_tokens": 4096,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            }
            if temperature is not None:
                kwargs["temperature"] = temperature
            resp = await client.messages.create(**kwargs)
            return resp.content[0].text

        else:
            raise ValueError(f"不支持的 LLM provider: {provider}")

    async def stream(
        self,
        system: str,
        user: str,
        model: str = "",
        override: LLMOverride | None = None,
    ) -> AsyncIterator[str]:
        """流式补全，逐 token yield。

        Args:
            system: system prompt
            user: user prompt
            model: 模型名（空则用 provider 默认模型）
            override: 请求级 LLM 配置覆盖（用户自定义）
        """
        provider = self._resolve_provider(override)
        model = self._resolve_model(model, override)
        client = self._get_client_for_provider(provider, override)
        temperature = override.temperature if override else None

        if provider == "openai":
            kwargs: dict = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": True,
            }
            if temperature is not None:
                kwargs["temperature"] = temperature
            stream = await client.chat.completions.create(**kwargs)
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content

        elif provider == "anthropic":
            kwargs = {
                "model": model,
                "max_tokens": 4096,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            }
            if temperature is not None:
                kwargs["temperature"] = temperature
            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text

        else:
            raise ValueError(f"不支持的 LLM provider: {provider}")


# 全局单例
llm_client = LLMClient()
