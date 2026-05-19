FROM python:3.12-slim
WORKDIR /app

# Install Node.js + Claude Code CLI (for OAuth login flow)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g @anthropic-ai/claude-code && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    benkyo \
    uvicorn[standard] \
    fastapi \
    sqlalchemy[asyncio] \
    asyncpg \
    psycopg2-binary \
    anthropic \
    python-multipart \
    aiofiles \
    pydantic-settings \
    greenlet

COPY app/ ./app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
