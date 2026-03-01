"""
Ingestion Service — Payload Validator
Validates raw MQTT payloads before publishing to the Event Bus.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

# Topic pattern: sentineledge/{tenant_id}/sensors/{sensor_external_id}/events
TOPIC_PATTERN = re.compile(
    r"^sentineledge/(?P<tenant_id>[^/]+)/sensors/(?P<sensor_id>[^/]+)/events$"
)


class IncomingEventPayload(BaseModel):
    """Payload raw que llega por MQTT vía JSON."""

    event_type: str = Field(..., max_length=100)
    timestamp: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_type")
    @classmethod
    def event_type_alphanumeric(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("event_type must be alphanumeric with underscores")
        return v.lower()

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> datetime | None:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v, tz=timezone.utc)
        return v


class ValidatedEvent(BaseModel):
    """Evento validado listo para publicar al Event Bus."""

    correlation_id: UUID = Field(default_factory=uuid4)
    tenant_id: str
    sensor_external_id: str
    event_type: str
    payload: dict[str, Any]
    received_at: str  # ISO 8601
    mqtt_topic: str


def parse_topic(topic: str) -> tuple[str, str] | None:
    """Extract tenant_id and sensor_external_id from MQTT topic."""
    match = TOPIC_PATTERN.match(topic)
    if not match:
        return None
    return match.group("tenant_id"), match.group("sensor_id")


def validate_event(
    topic: str,
    raw_payload: bytes,
) -> ValidatedEvent | None:
    """
    Parse and validate a raw MQTT message.
    Returns None if the message is invalid (should be discarded).
    """
    # 1. Parse topic
    result = parse_topic(topic)
    if result is None:
        return None
    tenant_id, sensor_external_id = result

    # 2. Parse JSON payload
    try:
        data = json.loads(raw_payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    # 3. Validate payload structure
    try:
        incoming = IncomingEventPayload.model_validate(data)
    except Exception:
        return None

    # 4. Build validated event
    return ValidatedEvent(
        tenant_id=tenant_id,
        sensor_external_id=sensor_external_id,
        event_type=incoming.event_type,
        payload={
            **incoming.data,
            **({"sensor_timestamp": incoming.timestamp.isoformat()} if incoming.timestamp else {}),
        },
        received_at=datetime.now(tz=timezone.utc).isoformat(),
        mqtt_topic=topic,
    )
