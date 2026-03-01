"""
Rule Engine Service — Main entrypoint
Consumes raw events → evaluates rules → publishes enriched events.
"""
from __future__ import annotations

import asyncio
import json
import signal
import sys
from datetime import datetime, timezone

import aio_pika
import asyncpg
import redis.asyncio as aioredis
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings
from src.rule_evaluator import RuleEvaluator
from src.rule_repository import RuleRepository

# ── Structured logger ─────────────────────────────────────────────────────────
import logging
import structlog

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
logger = structlog.get_logger("rule-engine-service")

# ── FastAPI health app ────────────────────────────────────────────────────────
app = FastAPI(title="Rule Engine Service", docs_url=None, redoc_url=None)

_stats = {"processed": 0, "matched": 0, "errors": 0}


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "rule-engine-service", "stats": _stats})


# ── Core engine ───────────────────────────────────────────────────────────────

class RuleEngineWorker:
    def __init__(self) -> None:
        self._db_pool: asyncpg.Pool | None = None
        self._redis: aioredis.Redis | None = None
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.RobustChannel | None = None
        self._processed_exchange: aio_pika.Exchange | None = None
        self._alerts_exchange: aio_pika.Exchange | None = None
        self._evaluator = RuleEvaluator()
        self._repo: RuleRepository | None = None

    @retry(stop=stop_after_attempt(10), wait=wait_exponential(min=2, max=30), reraise=True)
    async def _connect_db(self) -> None:
        self._db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2, max_size=10,
            command_timeout=30,
        )
        logger.info("rule-engine: postgres connected")

    @retry(stop=stop_after_attempt(10), wait=wait_exponential(min=2, max=30), reraise=True)
    async def _connect_rabbitmq(self) -> None:
        self._connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=settings.rabbitmq_prefetch)

        self._processed_exchange = await self._channel.declare_exchange(
            settings.rabbitmq_output_exchange, aio_pika.ExchangeType.TOPIC, durable=True
        )
        self._alerts_exchange = await self._channel.declare_exchange(
            settings.rabbitmq_alert_exchange, aio_pika.ExchangeType.TOPIC, durable=True
        )

        queue = await self._channel.declare_queue(
            settings.rabbitmq_input_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": "perimetral.dlx",
                "x-dead-letter-routing-key": "dlq.rule-engine",
                "x-message-ttl": 300000,
                "x-max-length": 100000,
            },
        )
        input_exchange = await self._channel.declare_exchange(
            settings.rabbitmq_input_exchange, aio_pika.ExchangeType.TOPIC, durable=True
        )
        await queue.bind(input_exchange, routing_key="event.raw.#")

        logger.info("rule-engine: rabbitmq connected")
        return queue

    async def _process_message(self, message: aio_pika.IncomingMessage) -> None:
        async with message.process(requeue=True):
            try:
                event = json.loads(message.body.decode())
                tenant_id = event.get("tenant_id")

                if not tenant_id:
                    logger.warning("rule-engine: missing tenant_id, skipping")
                    return

                # Fetch rules (cached)
                rules = await self._repo.get_rules(tenant_id)

                # Evaluate
                result = self._evaluator.evaluate(event, rules)

                # Build enriched event
                enriched = {
                    **event,
                    "severity": result["severity"],
                    "matched_rule_id": result["matched_rule_id"],
                    "matched_rule_name": result["matched_rule_name"],
                    "actions": result["actions"],
                    "processed_at": datetime.now(tz=timezone.utc).isoformat(),
                    "processed": True,
                }

                _stats["processed"] += 1

                # Publish enriched event to processed exchange
                await self._processed_exchange.publish(
                    aio_pika.Message(
                        body=json.dumps(enriched, default=str).encode(),
                        content_type="application/json",
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    ),
                    routing_key=f"event.processed.{result['severity']}",
                )

                # If rule matched, publish alert trigger
                if result["rule_matched"]:
                    _stats["matched"] += 1
                    await self._alerts_exchange.publish(
                        aio_pika.Message(
                            body=json.dumps(enriched, default=str).encode(),
                            content_type="application/json",
                            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                        ),
                        routing_key=f"alert.trigger.{result['severity']}",
                    )

            except Exception as exc:
                _stats["errors"] += 1
                logger.error("rule-engine: message processing error", exc=str(exc))
                raise

    async def run(self) -> None:
        await self._connect_db()

        self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        self._repo = RuleRepository(self._db_pool, self._redis)

        queue = await self._connect_rabbitmq()

        logger.info("rule-engine: consuming queue", queue=settings.rabbitmq_input_queue)
        await queue.consume(self._process_message)

    async def stop(self) -> None:
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
        if self._db_pool:
            await self._db_pool.close()
        if self._redis:
            await self._redis.aclose()
        logger.info("rule-engine: stopped")


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    worker = RuleEngineWorker()
    await worker.run()

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    server_config = uvicorn.Config(app=app, host="0.0.0.0", port=settings.port,
                                   log_level="warning", access_log=False)
    server = uvicorn.Server(server_config)
    serve_task = asyncio.create_task(server.serve())

    await stop_event.wait()
    server.should_exit = True
    await serve_task
    await worker.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
