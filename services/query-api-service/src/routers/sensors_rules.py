"""
Query API Service — Sensors & Rules Routers
Full CRUD with Redis cache invalidation for rules.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

import asyncpg
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.auth import AuthUser, get_current_user, require_role
from src.config import settings
from src.database import get_db


# ── Cache invalidation helper ─────────────────────────────────────────────────

async def _invalidate_rule_cache(tenant_id: str) -> None:
    """
    Remove cached rules for a tenant from Redis.
    Non-fatal — stale cache expires via TTL if Redis is unavailable.
    """
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.delete(f"rules:tenant:{tenant_id}")
        await r.aclose()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# SENSORS
# ══════════════════════════════════════════════════════════════════════════════

sensors_router = APIRouter(prefix="/api/v1/sensors", tags=["sensors"])


class CreateSensorRequest(BaseModel):
    external_id: str = Field(..., max_length=255, description="Physical device ID (matches MQTT topic)")
    name: Optional[str] = Field(None, max_length=255)
    type: str = Field(..., pattern="^(camera|motion|door|fence|access|other)$")
    location: dict[str, Any] = Field(default_factory=dict, description="{lat, lng, zone, description}")
    metadata: dict[str, Any] = Field(default_factory=dict)


class UpdateSensorRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    type: Optional[str] = Field(None, pattern="^(camera|motion|door|fence|access|other)$")
    location: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


@sensors_router.get("")
async def list_sensors(
    sensor_type: Optional[str] = Query(None, alias="type"),
    is_active: Optional[bool] = Query(None),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    conditions = ["tenant_id = $1"]
    params: list = [user.tenant_id]
    idx = 2

    if sensor_type:
        params.append(sensor_type)
        conditions.append(f"type = ${idx}")
        idx += 1
    if is_active is not None:
        params.append(is_active)
        conditions.append(f"is_active = ${idx}")
        idx += 1

    where = " AND ".join(conditions)
    rows = await db.fetch(
        f"SELECT id, external_id, name, type, location, is_active, last_seen, created_at FROM sensors WHERE {where} ORDER BY name",
        *params,
    )
    return {"data": [dict(r) for r in rows], "total": len(rows)}


@sensors_router.post("", status_code=201)
async def create_sensor(
    body: CreateSensorRequest,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        row = await db.fetchrow(
            """INSERT INTO sensors (tenant_id, external_id, name, type, location, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, external_id, name, type, location, is_active, created_at""",
            user.tenant_id, body.external_id, body.name, body.type,
            body.location, body.metadata,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sensor with external_id '{body.external_id}' already exists for this tenant",
        )
    return dict(row)


@sensors_router.get("/{sensor_id}")
async def get_sensor(
    sensor_id: UUID,
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """SELECT id, external_id, name, type, location, metadata,
                  is_active, last_seen, created_at, updated_at
           FROM sensors WHERE id = $1 AND tenant_id = $2""",
        sensor_id, user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    return dict(row)


@sensors_router.patch("/{sensor_id}")
async def update_sensor(
    sensor_id: UUID,
    body: UpdateSensorRequest,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    field_map = {
        "name": body.name,
        "type": body.type,
        "location": body.location,
        "metadata": body.metadata,
        "is_active": body.is_active,
    }
    set_parts: list[str] = []
    params: list = []
    idx = 1

    for col, val in field_map.items():
        if val is not None:
            params.append(val)
            set_parts.append(f"{col} = ${idx}")
            idx += 1

    if not set_parts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_parts.append("updated_at = NOW()")
    params.extend([sensor_id, user.tenant_id])

    row = await db.fetchrow(
        f"""UPDATE sensors SET {', '.join(set_parts)}
            WHERE id = ${idx} AND tenant_id = ${idx + 1}
            RETURNING id, external_id, name, type, location, is_active, updated_at""",
        *params,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    return dict(row)


@sensors_router.delete("/{sensor_id}", status_code=204)
async def deactivate_sensor(
    sensor_id: UUID,
    user: AuthUser = Depends(require_role("admin")),
    db: asyncpg.Connection = Depends(get_db),
):
    """Soft-delete: sets is_active = false (preserves historical event data)."""
    result = await db.execute(
        "UPDATE sensors SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        sensor_id, user.tenant_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")


# ══════════════════════════════════════════════════════════════════════════════
# RULES
# ══════════════════════════════════════════════════════════════════════════════

rules_router = APIRouter(prefix="/api/v1/rules", tags=["rules"])


class RuleRequest(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    condition: dict[str, Any] = Field(
        ...,
        description="Condition tree. Operators: eq|ne|gt|gte|lt|lte|in|nin|contains. Logical: {and:[...]}, {or:[...]}",
    )
    severity: str = Field(..., pattern="^(low|medium|high|critical)$")
    actions: list[Any] = Field(default_factory=list)
    priority: int = Field(default=100, ge=1, le=1000, description="Higher = evaluated first")


@rules_router.get("")
async def list_rules(
    is_active: Optional[bool] = Query(None),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    conditions = ["tenant_id = $1"]
    params: list = [user.tenant_id]
    if is_active is not None:
        params.append(is_active)
        conditions.append("is_active = $2")

    where = " AND ".join(conditions)
    rows = await db.fetch(
        f"""SELECT id, name, description, condition, severity, actions,
                   priority, is_active, created_at, updated_at
            FROM rules WHERE {where} ORDER BY priority DESC, created_at DESC""",
        *params,
    )
    return {"data": [dict(r) for r in rows], "total": len(rows)}


@rules_router.post("", status_code=201)
async def create_rule(
    body: RuleRequest,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """INSERT INTO rules (tenant_id, name, description, condition, severity, actions, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, description, condition, severity, actions,
                     priority, is_active, created_at""",
        user.tenant_id, body.name, body.description,
        body.condition, body.severity, body.actions, body.priority,
    )
    await _invalidate_rule_cache(user.tenant_id)
    return dict(row)


@rules_router.get("/{rule_id}")
async def get_rule(
    rule_id: UUID,
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """SELECT id, name, description, condition, severity, actions,
                  priority, is_active, created_at, updated_at
           FROM rules WHERE id = $1 AND tenant_id = $2""",
        rule_id, user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return dict(row)


@rules_router.put("/{rule_id}")
async def update_rule(
    rule_id: UUID,
    body: RuleRequest,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE rules
           SET name=$1, description=$2, condition=$3, severity=$4,
               actions=$5, priority=$6, updated_at=NOW()
           WHERE id=$7 AND tenant_id=$8
           RETURNING id, name, description, condition, severity, actions,
                     priority, is_active, updated_at""",
        body.name, body.description, body.condition, body.severity,
        body.actions, body.priority, rule_id, user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    await _invalidate_rule_cache(user.tenant_id)
    return dict(row)


@rules_router.patch("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: UUID,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE rules SET is_active = NOT is_active, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2
           RETURNING id, name, is_active""",
        rule_id, user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    await _invalidate_rule_cache(user.tenant_id)
    return dict(row)


@rules_router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID,
    user: AuthUser = Depends(require_role("admin")),
    db: asyncpg.Connection = Depends(get_db),
):
    result = await db.execute(
        "DELETE FROM rules WHERE id = $1 AND tenant_id = $2",
        rule_id, user.tenant_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    await _invalidate_rule_cache(user.tenant_id)
