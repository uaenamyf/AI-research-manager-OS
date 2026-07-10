# date: 2026-07-10
# dev: myf
"""应用配置：通过环境变量加载，pydantic-settings 管理与校验。"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置，从环境变量读取。

    与 backend 共享的密钥（INTERNAL_TOKEN）必须两端一致。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── 基础设施 ──
    DATABASE_URL: str = (
        "postgresql+asyncpg://researchos:researchos@localhost:5432/researchos"
    )
    REDIS_URL: str = "redis://localhost:6379/0"
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"

    # ── 内部鉴权（与 backend 共享）──
    INTERNAL_TOKEN: str = "dev-internal-token"

    # ── backend 回调地址 ──
    BACKEND_URL: str = "http://localhost:8080"

    # ── LLM 配置 ──
    LLM_PROVIDER: str = "openai"  # openai | anthropic
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Embedding 配置 ──
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536

    # ── RAG 参数 ──
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    RETRIEVE_TOP_K: int = 5

    # ── MQ 重试 ──
    MQ_MAX_RETRIES: int = 3


settings = Settings()
