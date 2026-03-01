# ─────────────────────────────────────────────────────────────────────────────
# Auth Service — Dockerfile
# Node.js 20 | JWT + RBAC + Multi-tenant
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

LABEL maintainer="perimetral-platform"
LABEL service="auth-service"

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src/ ./src/

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
