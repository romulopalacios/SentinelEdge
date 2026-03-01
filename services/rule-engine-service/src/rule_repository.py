"""
Rule Engine Service — Rule Repository
Fetches rules from PostgreSQL with Redis caching.
"""
from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

import asyncpg
import redis.asyncio as aioredis

from src.config import settings

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class RuleRepository:
    def __init__(self, db_pool: asyncpg.Pool, redis_client: aioredis.Redis) -> None:
        self._db = db_pool
        self._redis = redis_client
        self._ttl = settings.rule_cache_ttl_seconds

    def _cache_key(self, tenant_ref: str) -> str:
        return f"rules:tenant:{tenant_ref}"

    async def _resolve_uuid(self, tenant_id: str) -> UUID | None:
        """
        If tenant_id looks like a UUID, return it as-is.
        Otherwise treat it as a slug and look up the tenant UUID.
        """
        if _UUID_RE.match(tenant_id):
            return UUID(tenant_id)
        row = await self._db.fetchrow(
            "SELECT id FROM tenants WHERE slug = $1 AND is_active = true",
            tenant_id,
        )
        return row["id"] if row else None

    async def get_rules(self, tenant_id: str) -> list[dict[str, Any]]:
        """
        Return active rules for a tenant.
        tenant_id may be a UUID string or a slug.
        Cache key is always the UUID string to be consistent with query-api invalidations.
        """
        # Resolve slug → UUID first (cache key must use UUID)
        tenant_uuid = await self._resolve_uuid(tenant_id)
        if tenant_uuid is None:
            return []

        uuid_str = str(tenant_uuid)
        cache_key = self._cache_key(uuid_str)

        # Try cache first
        cached = await self._redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Fetch from DB
        rows = await self._db.fetch(
            """
            SELECT id, name, condition, severity, actions, priority
            FROM rules
            WHERE tenant_id = $1 AND is_active = true
            ORDER BY priority DESC
            """,
            tenant_uuid,
        )

        rules = [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "condition": json.loads(row["condition"]) if isinstance(row["condition"], str) else dict(row["condition"]),
                "severity": row["severity"],
                "actions": json.loads(row["actions"]) if isinstance(row["actions"], str) else list(row["actions"]),
                "priority": row["priority"],
                "is_active": True,
            }
            for row in rows
        ]

        # Cache result
        await self._redis.setex(cache_key, self._ttl, json.dumps(rules))
        return rules

    async def invalidate_cache(self, tenant_id: str) -> None:
        await self._redis.delete(self._cache_key(tenant_id))
