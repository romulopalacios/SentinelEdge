"""
Ingestion Service — RabbitMQ Publisher
Publishes validated events to the perimetral.ingestion exchange.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import aio_pika
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from src.config import settings
from src.logging_config import logger


class RabbitMQPublisher:
    def __init__(self) -> None:
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.RobustChannel | None = None
        self._exchange: aio_pika.Exchange | None = None
        self._published: int = 0
        self._errors: int = 0

    @retry(
        stop=stop_after_attempt(10),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def connect(self) -> None:
        logger.info("rabbitmq.publisher: connecting", url=settings.rabbitmq_url[:30] + "...")
        self._connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=100)

        self._exchange = await self._channel.declare_exchange(
            settings.rabbitmq_exchange,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("rabbitmq.publisher: connected and exchange declared",
                    exchange=settings.rabbitmq_exchange)

    async def publish(self, event_dict: dict[str, Any]) -> bool:
        """
        Publish a validated event to the ingestion exchange.
        Returns True on success, False on failure.
        """
        if self._exchange is None:
            logger.error("rabbitmq.publisher: not connected")
            return False

        try:
            body = json.dumps(event_dict, default=str).encode()
            message = aio_pika.Message(
                body=body,
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                headers={
                    "correlation_id": str(event_dict.get("correlation_id", "")),
                    "tenant_id": str(event_dict.get("tenant_id", "")),
                    "event_type": str(event_dict.get("event_type", "")),
                },
            )
            routing_key = f"{settings.rabbitmq_routing_key}.{event_dict.get('event_type', 'unknown')}"

            await self._exchange.publish(message, routing_key=routing_key)
            self._published += 1

            if self._published % 1000 == 0:
                logger.info("rabbitmq.publisher: throughput",
                            total_published=self._published,
                            errors=self._errors)
            return True

        except Exception as exc:
            self._errors += 1
            logger.error("rabbitmq.publisher: publish error", exc=str(exc),
                         correlation_id=event_dict.get("correlation_id"))
            return False

    async def close(self) -> None:
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
        logger.info("rabbitmq.publisher: closed")

    @property
    def stats(self) -> dict[str, int]:
        return {"published": self._published, "errors": self._errors}
