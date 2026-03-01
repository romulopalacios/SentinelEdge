# ─────────────────────────────────────────────────────────────────────────────
# Rule Engine Service — Dockerfile
# Python 3.12 | RabbitMQ consumer + rule processor
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

LABEL maintainer="perimetral-platform"
LABEL service="rule-engine-service"

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

USER app

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["python", "-m", "src.main"]
