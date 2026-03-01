# ─────────────────────────────────────────────────────────────────────────────
# Alert Service — Dockerfile
# Node.js 20 | RabbitMQ consumer + WebSocket server
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

LABEL maintainer="perimetral-platform"
LABEL service="alert-service"

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src/ ./src/

USER app

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "src/index.js"]
