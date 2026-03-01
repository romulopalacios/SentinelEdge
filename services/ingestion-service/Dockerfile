# ─────────────────────────────────────────────────────────────────────────────
# Ingestion Service — Dockerfile
# Python 3.12 | MQTT + RabbitMQ publisher
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Metadatos
LABEL maintainer="perimetral-platform"
LABEL service="ingestion-service"

# Sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc curl \
    && rm -rf /var/lib/apt/lists/*

# Usuario no-root
RUN useradd --create-home --shell /bin/bash app
WORKDIR /app

# Dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código fuente
COPY src/ ./src/

USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["python", "-m", "src.main"]
