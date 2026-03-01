"""
Ingestion Service — MQTT Client
Subscribes to sensor topics and dispatches validated events to RabbitMQ.
"""
from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

import asyncpg
import paho.mqtt.client as mqtt

from src.config import settings
from src.logging_config import logger
from src.publisher import RabbitMQPublisher
from src.validator import validate_event

# ── Sensor UUID cache (in-memory, TTL = 5 min) ───────────────────────────────
_SENSOR_CACHE_TTL = 300  # seconds
_sensor_cache: dict[tuple[str, str], tuple[str | None, float]] = {}


async def _resolve_sensor_id(
    tenant_id: str,
    external_id: str,
    db_pool: asyncpg.Pool,
) -> str | None:
    """
    Lookup sensor UUID by (tenant_slug_or_uuid, external_id).
    Uses an in-memory cache to avoid per-message DB queries.
    Returns None if sensor is not registered (non-fatal).
    """
    key = (tenant_id, external_id)
    cached = _sensor_cache.get(key)
    if cached and time.monotonic() < cached[1]:
        return cached[0]

    try:
        # tenant_id from MQTT topic is a slug; resolve to UUID first
        tenant_row = await db_pool.fetchrow(
            "SELECT id FROM tenants WHERE slug = $1 AND is_active = true",
            tenant_id,
        )
        if tenant_row is None:
            _sensor_cache[key] = (None, time.monotonic() + _SENSOR_CACHE_TTL)
            return None

        sensor_row = await db_pool.fetchrow(
            "SELECT id FROM sensors WHERE tenant_id = $1 AND external_id = $2 AND is_active = true",
            tenant_row["id"], external_id,
        )
        sensor_uuid = str(sensor_row["id"]) if sensor_row else None
        _sensor_cache[key] = (sensor_uuid, time.monotonic() + _SENSOR_CACHE_TTL)
        return sensor_uuid

    except Exception as exc:
        logger.warning("ingestion: sensor lookup failed", tenant_id=tenant_id,
                       external_id=external_id, exc=str(exc))
        return None


class MQTTIngestionClient:
    def __init__(
        self,
        publisher: RabbitMQPublisher,
        db_pool: asyncpg.Pool | None = None,
    ) -> None:
        self._publisher = publisher
        self._db_pool = db_pool
        self._client = mqtt.Client(client_id=settings.mqtt_client_id)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._connected = False
        self._received: int = 0
        self._invalid: int = 0
        self._stopping = False

        # Auto-reconnect with exponential backoff (1s → 30s)
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)

        # Configure credentials
        self._client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

        # Register callbacks
        self._client.on_connect    = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message    = self._on_message

    def _on_connect(self, client: Any, _userdata: Any, _flags: Any, rc: int) -> None:
        if rc == 0:
            self._connected = True
            client.subscribe(settings.mqtt_topic_wildcard, qos=settings.mqtt_qos)
            logger.info(
                "mqtt.client: connected and subscribed",
                topic=settings.mqtt_topic_wildcard,
                qos=settings.mqtt_qos,
            )
        else:
            logger.error("mqtt.client: connection failed", return_code=rc)

    def _on_disconnect(self, _client: Any, _userdata: Any, rc: int) -> None:
        self._connected = False
        if self._stopping:
            logger.info("mqtt.client: graceful disconnect")
            return
        logger.warning("mqtt.client: unexpected disconnect — will reconnect", return_code=rc)
        threading.Timer(5.0, self._try_reconnect).start()

    def _try_reconnect(self) -> None:
        if self._stopping or self._connected:
            return
        try:
            self._client.reconnect()
            logger.info("mqtt.client: reconnect attempted")
        except Exception as exc:
            logger.warning("mqtt.client: reconnect failed, retrying in 10s", exc=str(exc))
            threading.Timer(10.0, self._try_reconnect).start()

    def _on_message(self, _client: Any, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
        """
        Called from paho's network thread.
        Schedule coroutine on the asyncio event loop.
        """
        self._received += 1
        if self._loop:
            asyncio.run_coroutine_threadsafe(
                self._handle_message(msg.topic, msg.payload),
                self._loop,
            )

    async def _handle_message(self, topic: str, payload: bytes) -> None:
        validated = validate_event(topic, payload)

        if validated is None:
            self._invalid += 1
            logger.warning(
                "mqtt.client: invalid/unparseable message",
                topic=topic,
                total_invalid=self._invalid,
            )
            return

        event_dict = validated.model_dump()

        # Enrich with registered sensor UUID (best-effort; non-fatal if missing)
        if self._db_pool is not None:
            sensor_uuid = await _resolve_sensor_id(
                validated.tenant_id,
                validated.sensor_external_id,
                self._db_pool,
            )
            if sensor_uuid:
                event_dict["sensor_id"] = sensor_uuid

        success = await self._publisher.publish(event_dict)
        if success:
            logger.debug(
                "mqtt.client: event dispatched",
                correlation_id=str(validated.correlation_id),
                tenant_id=validated.tenant_id,
                event_type=validated.event_type,
                sensor_id=event_dict.get("sensor_id"),
            )

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._client.connect(
            settings.mqtt_host,
            settings.mqtt_port,
            keepalive=settings.mqtt_keepalive,
        )
        self._client.loop_start()
        logger.info(
            "mqtt.client: loop started",
            host=settings.mqtt_host,
            port=settings.mqtt_port,
        )

    def stop(self) -> None:
        self._stopping = True
        self._client.loop_stop()
        self._client.disconnect()
        logger.info(
            "mqtt.client: stopped",
            total_received=self._received,
            total_invalid=self._invalid,
        )

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def stats(self) -> dict[str, int]:
        return {"received": self._received, "invalid": self._invalid}
