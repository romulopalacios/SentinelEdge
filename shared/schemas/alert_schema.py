"""
shared/schemas/alert_schema.py
Schemas Pydantic compartidos para el modelo de Alerta.
Usados por: alert-service (publicación), query-api-service (lectura)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


# ─── Mensaje al publicar una alerta nueva ─────────────────────────────────────

class AlertCreatedMessage(BaseModel):
    """Mensaje que publica Alert Service en perimetral.alerts"""

    correlation_id: UUID = Field(default_factory=uuid4)
    alert_id: UUID = Field(default_factory=uuid4)
    tenant_id: UUID
    sensor_id: UUID | None = None
    rule_id: UUID | None = None
    title: str = Field(..., max_length=255)
    description: str | None = None
    severity: AlertSeverity
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"use_enum_values": True}


# ─── Respuesta de la API ──────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    sensor_id: UUID | None
    rule_id: UUID | None
    correlation_id: UUID | None
    title: str
    description: str | None
    severity: AlertSeverity
    status: AlertStatus
    triggered_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    metadata: dict[str, Any]

    model_config = {"use_enum_values": True, "from_attributes": True}


class AlertListResponse(BaseModel):
    items: list[AlertResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
