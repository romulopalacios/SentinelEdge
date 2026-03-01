"""
Query API Service — Events Router
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from src.auth import AuthUser, get_current_user
from src.config import settings
from src.database import get_db

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.get("")
async def list_events(
    severity: Optional[str] = Query(None, description="Filter by severity: low|medium|high|critical"),
    event_type: Optional[str] = Query(None),
    sensor_id: Optional[UUID] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    processed: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.default_page_size, ge=1, le=settings.max_page_size),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    conditions = ["tenant_id = $1"]
    params: list = [user.tenant_id]
    idx = 2

    if severity:
        params.append(severity); conditions.append(f"severity = ${idx}"); idx += 1
    if event_type:
        params.append(event_type); conditions.append(f"event_type = ${idx}"); idx += 1
    if sensor_id:
        params.append(str(sensor_id)); conditions.append(f"sensor_id = ${idx}"); idx += 1
    if from_dt:
        params.append(from_dt); conditions.append(f"created_at >= ${idx}"); idx += 1
    if to_dt:
        params.append(to_dt); conditions.append(f"created_at <= ${idx}"); idx += 1
    if processed is not None:
        params.append(processed); conditions.append(f"processed = ${idx}"); idx += 1

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    total_row = await db.fetchrow(f"SELECT COUNT(*) FROM events WHERE {where}", *params)
    total = total_row["count"]

    params.extend([page_size, offset])
    rows = await db.fetch(
        f"""SELECT id, tenant_id, sensor_id, correlation_id, event_type,
                   severity, processed, created_at
            FROM events
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}""",
        *params,
    )

    return {
        "data": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/stats")
async def events_stats(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Aggregate counts by event_type and severity for the tenant."""
    params: list = [user.tenant_id]
    time_filter = ""
    idx = 2
    if from_dt:
        params.append(from_dt)
        time_filter += f" AND created_at >= ${idx}"
        idx += 1
    if to_dt:
        params.append(to_dt)
        time_filter += f" AND created_at <= ${idx}"
        idx += 1

    by_type = await db.fetch(
        f"""SELECT event_type, COUNT(*) AS total
            FROM events
            WHERE tenant_id = $1{time_filter}
            GROUP BY event_type ORDER BY total DESC""",
        *params,
    )
    by_severity = await db.fetch(
        f"""SELECT severity, COUNT(*) AS total
            FROM events
            WHERE tenant_id = $1{time_filter}
            GROUP BY severity ORDER BY total DESC""",
        *params,
    )
    total_row = await db.fetchrow(
        f"SELECT COUNT(*) FROM events WHERE tenant_id = $1{time_filter}",
        *params,
    )
    return {
        "total": total_row["count"],
        "by_type": [dict(r) for r in by_type],
        "by_severity": [dict(r) for r in by_severity],
    }


@router.get("/{event_id}")
async def get_event(
    event_id: UUID,
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    from fastapi import HTTPException, status
    row = await db.fetchrow(
        "SELECT * FROM events WHERE id = $1 AND tenant_id = $2",
        event_id, user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return dict(row)
