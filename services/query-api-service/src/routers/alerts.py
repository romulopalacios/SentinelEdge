"""
Query API Service — Alerts Router
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.auth import AuthUser, get_current_user, require_role
from src.config import settings
from src.database import get_db

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    alert_status: Optional[str] = Query(None, alias="status", description="open|acknowledged|resolved"),
    severity: Optional[str] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.default_page_size, ge=1, le=settings.max_page_size),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    conditions = ["tenant_id = $1"]
    params: list = [user.tenant_id]
    idx = 2

    if alert_status:
        params.append(alert_status); conditions.append(f"status = ${idx}"); idx += 1
    if severity:
        params.append(severity); conditions.append(f"severity = ${idx}"); idx += 1
    if from_dt:
        params.append(from_dt); conditions.append(f"triggered_at >= ${idx}"); idx += 1
    if to_dt:
        params.append(to_dt); conditions.append(f"triggered_at <= ${idx}"); idx += 1

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    total_row = await db.fetchrow(f"SELECT COUNT(*) FROM alerts WHERE {where}", *params)
    total = total_row["count"]

    params.extend([page_size, offset])
    rows = await db.fetch(
        f"""SELECT id, tenant_id, sensor_id, rule_id, correlation_id,
                   title, description, severity, status,
                   triggered_at, acknowledged_at, resolved_at
            FROM alerts
            WHERE {where}
            ORDER BY triggered_at DESC
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
async def alerts_stats(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Aggregate alert counts by status and severity."""
    params: list = [user.tenant_id]
    time_filter = ""
    idx = 2
    if from_dt:
        params.append(from_dt)
        time_filter += f" AND triggered_at >= ${idx}"
        idx += 1
    if to_dt:
        params.append(to_dt)
        time_filter += f" AND triggered_at <= ${idx}"
        idx += 1

    by_status = await db.fetch(
        f"""SELECT status, COUNT(*) AS total
            FROM alerts
            WHERE tenant_id = $1{time_filter}
            GROUP BY status ORDER BY total DESC""",
        *params,
    )
    by_severity = await db.fetch(
        f"""SELECT severity, COUNT(*) AS total
            FROM alerts
            WHERE tenant_id = $1{time_filter}
            GROUP BY severity ORDER BY total DESC""",
        *params,
    )
    open_row = await db.fetchrow(
        f"SELECT COUNT(*) FROM alerts WHERE tenant_id = $1 AND status = 'open'{time_filter}",
        *params,
    )
    return {
        "open": open_row["count"],
        "by_status": [dict(r) for r in by_status],
        "by_severity": [dict(r) for r in by_severity],
    }


@router.get("/{alert_id}")
async def get_alert(
    alert_id: UUID,
    user: AuthUser = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        "SELECT * FROM alerts WHERE id = $1 AND tenant_id = $2",
        str(alert_id), user.tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return dict(row)


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: UUID,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE alerts
           SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $3
           WHERE id = $1 AND tenant_id = $2 AND status = 'open'
           RETURNING id, status, acknowledged_at""",
        str(alert_id), user.tenant_id, user.user_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Alert not found or not in 'open' state")
    return dict(row)


@router.patch("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: UUID,
    user: AuthUser = Depends(require_role("admin", "operator")),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE alerts
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $3
           WHERE id = $1 AND tenant_id = $2 AND status != 'resolved'
           RETURNING id, status, resolved_at""",
        alert_id, user.tenant_id, user.user_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Alert not found or already resolved")
    return dict(row)
