"""
Query API Service — Database dependency (asyncpg pool)
"""
from __future__ import annotations

import json
from typing import AsyncGenerator

import asyncpg
from fastapi import Depends

from src.config import settings

_pool: asyncpg.Pool | None = None


async def _register_codecs(conn: asyncpg.Connection) -> None:
    """Register JSON/JSONB codecs so asyncpg uses Python dicts automatically."""
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=20,
        command_timeout=30,
        init=_register_codecs,
    )


async def close_pool() -> None:
    if _pool:
        await _pool.close()


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency: yields a DB connection from the pool."""
    async with _pool.acquire() as conn:
        yield conn
