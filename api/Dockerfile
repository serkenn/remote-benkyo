FROM python:3.12-slim
WORKDIR /app

# Install Node.js + Claude Code CLI (for OAuth login flow)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g @anthropic-ai/claude-code && \
    node $(npm root -g)/@anthropic-ai/claude-code/install.cjs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python deps and create non-root user in one layer so useradd
# is never left out of the Docker cache even if pip is cached.
# claudeuser (uid 1000) is required because --dangerously-skip-permissions
# is blocked for root in Claude Code.
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
    greenlet \
    pypdf && \
    useradd -m -s /bin/bash -u 1000 claudeuser

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY app/ ./app/

# entrypoint.sh chowns volume dirs then exec-su to claudeuser
ENTRYPOINT ["/entrypoint.sh"]
