FROM python:3.12-slim

WORKDIR /app

# 系统依赖（PyMuPDF + Node.js 22 用于 MCP 文献检索运行时）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY ai-service/pyproject.toml ./
RUN pip install --no-cache-dir .

# MCP 文献检索服务（预编译 dist，不需 Node.js 运行环境）
COPY mcp/ ./mcp/

# 应用代码
COPY ai-service/app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]