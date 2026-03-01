-- ─────────────────────────────────────────────────────────────────────────────
-- 01_extensions.sql
-- Habilitar extensiones necesarias
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;           -- búsqueda full-text eficiente
CREATE EXTENSION IF NOT EXISTS btree_gin;         -- índices GIN compuestos
