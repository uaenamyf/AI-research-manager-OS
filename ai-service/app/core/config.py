# date: 2026-07-10
# dev: myf
"""应用配置：通过环境变量加载，pydantic-settings 管理与校验。"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service 根目录（app/core/config.py 的上两级）
_BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """应用配置，从环境变量读取。

    与 backend 共享的密钥（INTERNAL_TOKEN）必须两端一致。
    """

    model_config = SettingsConfigDict(
        env_file=_BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── 基础设施 ──
    # 向量库（PostgreSQL + pgvector，paper_chunk 表）
    DATABASE_URL: str = (
        "postgresql+asyncpg://researchos:researchos@localhost:5432/researchos"
    )
    # 业务库（MySQL，ai-service 只读 paper 元数据）
    MYSQL_URL: str = (
        "mysql://researchos:researchos@localhost:3306/researchos"
    )
    REDIS_URL: str = "redis://localhost:6379/0"
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"

    # ── 内部鉴权（与 backend 共享）──
    INTERNAL_TOKEN: str = "dev-internal-token"

    # ── backend 回调地址 ──
    BACKEND_URL: str = "http://localhost:8080"

    # ── 文献检索 MCP（literature-search-mcp 的 dist/server.js 绝对路径）──
    LITERATURE_MCP_SERVER: str = str(
        _BASE_DIR.parent / "mcp" / "literature-search-mcp" / "dist" / "server.js"
    )

    # ── LLM 配置 ──
    LLM_PROVIDER: str = "openai"  # openai | anthropic
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""  # 火山引擎等兼容端点，空则用 OpenAI 默认
    OPENAI_DEFAULT_MODEL: str = "gpt-4o"  # 默认模型（火山引擎填接入点 ID）
    ANTHROPIC_API_KEY: str = ""

    # ── Embedding 配置（可与 LLM 使用不同 provider/key）──
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_API_KEY: str = ""  # 独立 embedding key，空则回退到 OPENAI_API_KEY
    EMBEDDING_BASE_URL: str = ""  # 独立 embedding base_url，空则回退到 OPENAI_BASE_URL
    EMBEDDING_DIM: int = 1536  # 兜底默认；生产由 .env 覆盖为 2048（doubao-embedding-vision），须与 PG vector(2048) 对齐

    # ── RAG 参数 ──
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    RETRIEVE_TOP_K: int = 5

    # ── MQ 重试 ──
    MQ_MAX_RETRIES: int = 3


settings = Settings()
