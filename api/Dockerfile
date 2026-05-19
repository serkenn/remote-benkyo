FROM python:3.12-slim
WORKDIR /app
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
