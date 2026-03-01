# ─────────────────────────────────────────────────────────────────────────────
# Query API Service — Dockerfile
# Python 3.12 | FastAPI — optimizado solo para lectura
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

LABEL maintainer="perimetral-platform"
LABEL service="query-api-service"

RUN apt-get update && apt-get install -y --no-install-recommends gcc curl && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

USER app

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8003", "--workers", "2"]
