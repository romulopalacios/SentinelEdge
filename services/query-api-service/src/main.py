"""
Query API Service — Main entrypoint (FastAPI)
"""
from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys

import aio_pika
import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from src.config import settings
from src.database import init_pool, close_pool, get_db
from src.routers.events import router as events_router
from src.routers.alerts import router as alerts_router
from src.routers.sensors_rules import sensors_router, rules_router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(stream=sys.stdout, level=getattr(logging, settings.log_level.upper(), logging.INFO))
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if settings.environment == "production"
        else structlog.dev.ConsoleRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
)
logger = structlog.get_logger("query-api-service")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="SentinelEdge Query API",
    description="Read-optimized API for events, alerts, sensors and rules",
    version="1.0.0",
    docs_url="/api/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

app.include_router(events_router)
app.include_router(alerts_router)
app.include_router(sensors_router)
app.include_router(rules_router)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "query-api-service"})


# ── Startup / Shutdown lifecycle ──────────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    await init_pool()
    # Start persist consumer in background
    asyncio.create_task(run_persist_consumer())
    logger.info("query-api-service: started", port=settings.port)


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_pool()


# ── RabbitMQ Persist Consumer ─────────────────────────────────────────────────
_persist_pool = None

# UUID format check — tenant_id in events may be a slug (e.g. 'demo-corp')
import re as _re
_UUID_RE = _re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    _re.IGNORECASE,
)
_tenant_uuid_cache: dict = {}


async def _resolve_tenant_uuid(tenant_ref: str, db) -> str | None:
    """Resolve a tenant slug or UUID string to the actual UUID."""
    if not tenant_ref:
        return None
    if _UUID_RE.match(tenant_ref):
        return tenant_ref
    if tenant_ref in _tenant_uuid_cache:
        return _tenant_uuid_cache[tenant_ref]
    row = await db.fetchrow(
        "SELECT id FROM tenants WHERE slug = $1 AND is_active = true",
        tenant_ref,
    )
    if row is None:
        return None
    uuid_str = str(row["id"])
    _tenant_uuid_cache[tenant_ref] = uuid_str
    return uuid_str


async def run_persist_consumer() -> None:
    """
    Consumes processed events from perimetral.processed exchange
    and persists them to the events table.
    """
    from src.database import _pool as pool

    for attempt in range(20):
        try:
            conn = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await conn.channel()
            await channel.set_qos(prefetch_count=100)

            exchange = await channel.declare_exchange(
                settings.persist_exchange, aio_pika.ExchangeType.TOPIC, durable=True
            )
            queue = await channel.declare_queue(
                settings.persist_queue,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": "perimetral.dlx",
                    "x-dead-letter-routing-key": "dlq.query-persist",
                    "x-max-length": 200000,
                    "x-message-ttl": 300000,
                },
            )
            await queue.bind(exchange, routing_key="event.processed.#")
            logger.info("persist-consumer: connected and consuming")

            async for message in queue:
                async with message.process(requeue=False):
                    try:
                        event = json.loads(message.body.decode())
                        if pool:
                            async with pool.acquire() as db:
                                tenant_uuid = await _resolve_tenant_uuid(
                                    event.get("tenant_id", ""), db
                                )
                                if not tenant_uuid:
                                    logger.warning(
                                        "persist-consumer: unknown tenant, skipping event",
                                        tenant_id=event.get("tenant_id"),
                                    )
                                    continue
                                await db.execute(
                                    """INSERT INTO events
                                         (id, tenant_id, sensor_id, correlation_id, event_type,
                                          raw_payload, enriched_payload, severity, processed)
                                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
                                       ON CONFLICT DO NOTHING""",
                                    event.get("correlation_id"),
                                    tenant_uuid,
                                    event.get("sensor_id"),
                                    event.get("correlation_id"),
                                    event.get("event_type", "unknown"),
                                    json.dumps(event.get("payload", {})),
                                    json.dumps(event),
                                    event.get("severity", "low"),
                                )
                    except Exception as exc:
                        logger.error("persist-consumer: error persisting event", exc=str(exc))
            return

        except Exception as exc:
            wait = min(2 ** attempt, 30)
            logger.warning("persist-consumer: connection failed, retrying",
                           attempt=attempt + 1, wait=wait, exc=str(exc))
            await asyncio.sleep(wait)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=settings.environment == "development",
    )
