"""
shared/schemas/event_schema.py
Schemas Pydantic compartidos para el modelo de Evento.
Usados por: ingestion-service, rule-engine-service, query-api-service
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EventType(str, Enum):
    MOTION_DETECTED = "motion_detected"
    DOOR_OPEN = "door_open"
    DOOR_FORCED = "door_forced"
    INTRUSION = "intrusion"
    ACCESS_GRANTED = "access_granted"
    ACCESS_DENIED = "access_denied"
    FENCE_BREACH = "fence_breach"
    CAMERA_OFFLINE = "camera_offline"
    SENSOR_TAMPER = "sensor_tamper"
    CUSTOM = "custom"


# ─── Raw event (salida del Ingestion Service hacia el Event Bus) ──────────────

class RawEventMessage(BaseModel):
    """Mensaje que publica Ingestion Service en perimetral.ingestion"""

    correlation_id: UUID = Field(default_factory=uuid4)
    tenant_id: UUID
    sensor_external_id: str = Field(..., max_length=255)
    event_type: str = Field(..., max_length=100)
    payload: dict[str, Any]
    received_at: datetime = Field(default_factory=datetime.utcnow)
    mqtt_topic: str

    model_config = {"use_enum_values": True}


# ─── Enriched event (salida del Rule Engine hacia perimetral.processed) ───────

class EnrichedEventMessage(BaseModel):
    """Mensaje que publica Rule Engine en perimetral.processed"""

    correlation_id: UUID
    tenant_id: UUID
    sensor_id: UUID | None = None
    sensor_external_id: str
    event_type: str
    severity: EventSeverity | None = None
    matched_rule_id: UUID | None = None
    raw_payload: dict[str, Any]
    enriched_payload: dict[str, Any]
    received_at: datetime
    processed_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"use_enum_values": True}


# ─── Routing key helper ───────────────────────────────────────────────────────

def build_routing_key(event_type: str, severity: EventSeverity | str | None = None) -> str:
    """
    Genera el routing key para RabbitMQ.
    Ejemplos:
      event.motion_detected
      event.critical
      event.high
    """
    if severity:
        return f"event.{severity}"
    return f"event.{event_type}"
