FROM python:3.12-slim

WORKDIR /app

# 系统依赖（PyMuPDF 等 manylinux wheel 通常无需额外系统库，保留 apt 以备不时之需）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        # PyMuPDF 渲染依赖（如需原生字体/图像支持）
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 先拷贝依赖文件，利用 Docker 缓存层
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# 拷贝应用代码
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
