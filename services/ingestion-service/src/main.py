"""
Ingestion Service — Main entrypoint
Starts the FastAPI health server + MQTT client + RabbitMQ publisher.
"""
from __future__ import annotations

import asyncio
import signal
import sys

import asyncpg
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from src.config import settings
from src.logging_config import logger
from src.publisher import RabbitMQPublisher
from src.mqtt_client import MQTTIngestionClient

# ── FastAPI app (health check only) ──────────────────────────────────────────
app = FastAPI(title="Ingestion Service", docs_url=None, redoc_url=None)

_publisher: RabbitMQPublisher | None = None
_mqtt_client: MQTTIngestionClient | None = None
_db_pool: asyncpg.Pool | None = None


@app.get("/health")
async def health():
    pub_stats = _publisher.stats if _publisher else {}
    mqtt_stats = _mqtt_client.stats if _mqtt_client else {}
    return JSONResponse({
        "status": "ok",
        "service": "ingestion-service",
        "mqtt_connected": _mqtt_client.is_connected if _mqtt_client else False,
        "publisher_stats": pub_stats,
        "mqtt_stats": mqtt_stats,
    })


# ── Main async runner ─────────────────────────────────────────────────────────
async def main() -> None:
    global _publisher, _mqtt_client, _db_pool

    logger.info("ingestion-service: starting",
                env=settings.environment,
                port=settings.port)

    # 1. Connect to RabbitMQ
    _publisher = RabbitMQPublisher()
    await _publisher.connect()

    # 2. Connect to PostgreSQL (for sensor UUID lookup; optional — degrade gracefully)
    try:
        _db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=3,
        )
        logger.info("ingestion-service: postgres pool ready")
    except Exception as exc:
        logger.warning("ingestion-service: postgres unavailable, sensor lookup disabled",
                       exc=str(exc))
        _db_pool = None

    # 3. Start MQTT client (runs in separate thread via paho)
    loop = asyncio.get_running_loop()
    _mqtt_client = MQTTIngestionClient(_publisher, db_pool=_db_pool)
    _mqtt_client.start(loop)

    # 3. Start FastAPI (health endpoint)
    server_config = uvicorn.Config(
        app=app,
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level.lower(),
        access_log=False,
    )
    server = uvicorn.Server(server_config)

    # 4. Graceful shutdown handler
    stop_event = asyncio.Event()

    def _handle_signal(*_: object) -> None:
        logger.info("ingestion-service: shutdown signal received")
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    # Run server until stop signal
    serve_task = asyncio.create_task(server.serve())
    await stop_event.wait()

    logger.info("ingestion-service: stopping")
    server.should_exit = True
    await serve_task

    _mqtt_client.stop()
    await _publisher.close()
    if _db_pool:
        await _db_pool.close()
    logger.info("ingestion-service: stopped cleanly")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
