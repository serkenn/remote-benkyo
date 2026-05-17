FROM python:3.12-slim

WORKDIR /app

# Install benkyo (root package)
COPY pyproject.toml uv.lock* README.md ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

# Install benkyo-web
COPY web/backend/ ./web/backend/
RUN pip install --no-cache-dir ./web/backend/

ENV BENKYO_DB=/data/db.sqlite
ENV BENKYO_SETTINGS=/data/settings.json

EXPOSE 8000

CMD ["uvicorn", "benkyo_web.app:app", "--host", "0.0.0.0", "--port", "8000"]
