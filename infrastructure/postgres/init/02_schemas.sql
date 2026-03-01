-- ─────────────────────────────────────────────────────────────────────────────
-- 02_schemas.sql
-- Schema principal del sistema multi-tenant
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── TENANTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    plan        VARCHAR(50)  NOT NULL DEFAULT 'standard', -- free | standard | enterprise
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    settings    JSONB        NOT NULL DEFAULT '{}',       -- config por tenant
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug     ON tenants (slug);
CREATE INDEX idx_tenants_active   ON tenants (is_active);

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(50)  NOT NULL DEFAULT 'viewer',  -- admin | operator | viewer
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant   ON users (tenant_id);
CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_role     ON users (tenant_id, role);

-- ─── REFRESH TOKENS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_hash   ON refresh_tokens (token_hash);

-- ─── SENSORS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id VARCHAR(255) NOT NULL,               -- ID del dispositivo físico
    name        VARCHAR(255),
    type        VARCHAR(100) NOT NULL,               -- camera | motion | door | fence | access
    location    JSONB        NOT NULL DEFAULT '{}',  -- {lat, lng, zone, description}
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    last_seen   TIMESTAMPTZ,
    metadata    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, external_id)
);

CREATE INDEX idx_sensors_tenant   ON sensors (tenant_id);
CREATE INDEX idx_sensors_type     ON sensors (tenant_id, type);
CREATE INDEX idx_sensors_active   ON sensors (tenant_id, is_active);

-- ─── RULES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    condition   JSONB        NOT NULL,   -- {field, operator, value} o árbol de condiciones
    severity    VARCHAR(50)  NOT NULL,   -- low | medium | high | critical
    actions     JSONB        NOT NULL DEFAULT '[]', -- [notify_email, webhook, etc.]
    priority    INTEGER      NOT NULL DEFAULT 100,  -- mayor = más prioritaria
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_tenant   ON rules (tenant_id);
CREATE INDEX idx_rules_active   ON rules (tenant_id, is_active);
CREATE INDEX idx_rules_priority ON rules (tenant_id, priority DESC);

-- ─── EVENTS (time-series) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL,
    sensor_id        UUID,
    correlation_id   UUID,                          -- traza end-to-end
    event_type       VARCHAR(100) NOT NULL,         -- motion_detected | door_open | intrusion | etc.
    raw_payload      JSONB        NOT NULL,         -- payload original del sensor
    enriched_payload JSONB,                         -- payload enriquecido por Rule Engine
    severity         VARCHAR(50),                   -- asignado por Rule Engine
    processed        BOOLEAN      NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Convertir a hypertable particionado por tiempo (TimescaleDB)
SELECT create_hypertable('events', 'created_at', chunk_time_interval => INTERVAL '1 day');

-- Compresión automática de chunks con más de 7 días
ALTER TABLE events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id,sensor_id',
    timescaledb.compress_orderby   = 'created_at DESC'
);
SELECT add_compression_policy('events', INTERVAL '7 days');

CREATE INDEX idx_events_tenant_time   ON events (tenant_id, created_at DESC);
CREATE INDEX idx_events_sensor        ON events (sensor_id, created_at DESC);
CREATE INDEX idx_events_type          ON events (tenant_id, event_type, created_at DESC);
CREATE INDEX idx_events_severity      ON events (tenant_id, severity, created_at DESC);
CREATE INDEX idx_events_correlation   ON events (correlation_id);
CREATE INDEX idx_events_processed     ON events (processed) WHERE processed = false;

-- ─── ALERTS (time-series) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    sensor_id       UUID,
    rule_id         UUID,
    correlation_id  UUID,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    severity        VARCHAR(50)  NOT NULL,              -- low | medium | high | critical
    status          VARCHAR(50)  NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
    acknowledged_by UUID,                               -- user_id
    resolved_by     UUID,                               -- user_id
    triggered_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    metadata        JSONB        NOT NULL DEFAULT '{}'
);

SELECT create_hypertable('alerts', 'triggered_at', chunk_time_interval => INTERVAL '1 day');

ALTER TABLE alerts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id',
    timescaledb.compress_orderby   = 'triggered_at DESC'
);
SELECT add_compression_policy('alerts', INTERVAL '30 days');

CREATE INDEX idx_alerts_tenant_time   ON alerts (tenant_id, triggered_at DESC);
CREATE INDEX idx_alerts_status        ON alerts (tenant_id, status, triggered_at DESC);
CREATE INDEX idx_alerts_severity      ON alerts (tenant_id, severity, triggered_at DESC);
CREATE INDEX idx_alerts_sensor        ON alerts (sensor_id, triggered_at DESC);
CREATE INDEX idx_alerts_rule          ON alerts (rule_id);
CREATE INDEX idx_alerts_open          ON alerts (tenant_id, status) WHERE status = 'open';

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL,
    user_id     UUID,
    action      VARCHAR(100) NOT NULL,   -- user.login | rule.create | alert.resolve | etc.
    entity_type VARCHAR(100),
    entity_id   UUID,
    details     JSONB        NOT NULL DEFAULT '{}',
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('audit_log', 'created_at', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_audit_tenant  ON audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_audit_user    ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log (action, created_at DESC);

-- ─── FUNCIÓN: updated_at automático ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_rules_updated_at
    BEFORE UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── SEED: Tenant de desarrollo ───────────────────────────────────────────────
INSERT INTO tenants (name, slug, plan) VALUES
    ('Demo Corp', 'demo-corp', 'enterprise'),
    ('Campus Uni Norte', 'campus-uni-norte', 'standard')
ON CONFLICT (slug) DO NOTHING;

-- ─── SEED: Usuario admin de desarrollo ────────────────────────────────────────
-- Contraseña definida mediante hash bcrypt (cost=10) — cambiar en producción
INSERT INTO users (tenant_id, email, password_hash, full_name, role)
VALUES (
    (SELECT id FROM tenants WHERE slug = 'demo-corp'),
    'admin@demo.com',
    '$2b$10$owCxLBRH44ESJ4kt7YpepOHbqexiYb7jFQi925gd8D7xkh73rYcYG',
    'Admin User',
    'admin'
)
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ─── SEED: Admin user ────────────────────────────────────────────────────────
INSERT INTO users (tenant_id, email, password_hash, full_name, role)
SELECT
    t.id,
    'admin@demo.com',
    '$2b$10$owCxLBRH44ESJ4kt7YpepOHbqexiYb7jFQi925gd8D7xkh73rYcYG',
    'Admin User',
    'admin'
FROM tenants t WHERE t.slug = 'demo-corp'
ON CONFLICT (tenant_id, email) DO NOTHING;

