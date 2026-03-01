'use strict';

const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./db');
const logger = require('./logger');
const config = require('./config');
const { dispatchActions } = require('./actions/dispatcher');

let channel = null;

// UUID format check — some tenant_id values may be slugs (e.g. 'demo-corp')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _tenantCache = {};

/**
 * Resolve a tenant slug (or UUID) to its actual UUID.
 * In-memory cache to avoid repeated DB lookups per message.
 */
async function resolveTenantUuid(tenantRef) {
  if (!tenantRef) return null;
  if (UUID_RE.test(tenantRef)) return tenantRef;
  if (_tenantCache[tenantRef]) return _tenantCache[tenantRef];
  const res = await query(
    'SELECT id FROM tenants WHERE slug = $1 AND is_active = true',
    [tenantRef]
  );
  if (!res.rows.length) return null;
  const uuid = res.rows[0].id;
  _tenantCache[tenantRef] = uuid;
  return uuid;
}

/**
 * Connect to RabbitMQ with retry.
 */
async function connectConsumer(wsServer, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqplib.connect(config.rabbitmq.url);
      channel = await conn.createChannel();
      await channel.prefetch(config.rabbitmq.prefetch);

      // Declare exchange
      await channel.assertExchange(config.rabbitmq.alertsExchange, 'topic', { durable: true });

      // Declare and bind queue
      const q = await channel.assertQueue(config.rabbitmq.alertsQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'perimetral.dlx',
          'x-message-ttl': 600000,
          'x-max-length': 50000,
        },
      });
      await channel.bindQueue(q.queue, config.rabbitmq.alertsExchange, 'alert.trigger.#');

      logger.info({ queue: q.queue }, 'alert-service: RabbitMQ consumer connected');

      // Start consuming
      channel.consume(q.queue, async (msg) => {
        if (!msg) return;
        try {
          await processAlertTrigger(msg, wsServer);
          channel.ack(msg);
        } catch (err) {
          logger.error({ err }, 'alert-service: message processing failed');
          channel.nack(msg, false, false); // send to DLQ
        }
      });

      conn.on('error', (err) => logger.error({ err }, 'RabbitMQ connection error'));
      conn.on('close', () => {
        logger.warn('RabbitMQ connection closed, reconnecting...');
        setTimeout(() => connectConsumer(wsServer), 5000);
      });

      return;
    } catch (err) {
      logger.warn({ attempt: i + 1, err: err.message }, 'RabbitMQ: connection attempt failed');
      await new Promise((r) => setTimeout(r, Math.min(2000 * (i + 1), 30000)));
    }
  }
  throw new Error('Failed to connect to RabbitMQ after max retries');
}

/**
 * Process an alert trigger message:
 * 1. Deduplicate (check for open alert with same rule/sensor/tenant in last 5min)
 * 2. Persist to DB
 * 3. Push to WebSocket subscribers
 */
async function processAlertTrigger(msg, wsServer) {
  const event = JSON.parse(msg.content.toString());
  const {
    correlation_id,
    tenant_id,
    sensor_external_id,
    matched_rule_id,
    matched_rule_name,
    event_type,
    severity,
    actions,
  } = event;

  // Resolve slug → UUID (tenant_id from MQTT topic is a slug, e.g. 'demo-corp')
  const tenantUuid = await resolveTenantUuid(tenant_id);
  if (!tenantUuid) {
    logger.warn({ tenant_id }, 'alert-service: unknown tenant, skipping alert');
    return;
  }

  // Check for recent duplicate alert (within 5 minutes, same rule + tenant)
  const dedup = await query(
    `SELECT id FROM alerts
     WHERE tenant_id = $1
       AND rule_id = $2
       AND status = 'open'
       AND triggered_at > NOW() - INTERVAL '5 minutes'
     LIMIT 1`,
    [tenantUuid, matched_rule_id || null]
  );

  if (dedup.rows.length > 0) {
    logger.debug({ tenantId: tenantUuid, ruleId: matched_rule_id }, 'alert-service: dedup — skipping duplicate');
    return;
  }

  // Persist alert
  const alertId = uuidv4();
  const title = `${matched_rule_name || event_type} — ${severity.toUpperCase()}`;
  const description = `Event '${event_type}' triggered rule '${matched_rule_name || 'N/A'}' on sensor '${sensor_external_id || 'unknown'}'.`;

  const { rows } = await query(
    `INSERT INTO alerts
       (id, tenant_id, rule_id, correlation_id, title, description, severity, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)
     RETURNING id, tenant_id, title, severity, status, triggered_at`,
    [
      alertId,
      tenantUuid,
      matched_rule_id || null,
      correlation_id || null,
      title,
      description,
      severity,
      JSON.stringify({ event_type, sensor_external_id }),
    ]
  );

  const newAlert = rows[0];
  logger.info({ alertId: newAlert.id, tenantId: tenantUuid, severity }, 'alert-service: alert created');

  // Dispatch rule actions (non-fatal — alert already in DB)
  if (Array.isArray(actions) && actions.length > 0) {
    const ctx = {
      alertId:           newAlert.id,
      title,
      severity,
      tenantId:          tenantUuid,
      ruleId:            matched_rule_id   ?? null,
      ruleName:          matched_rule_name ?? null,
      sensorExternalId:  sensor_external_id ?? null,
      triggeredAt:       newAlert.triggered_at
                           ? new Date(newAlert.triggered_at).toISOString()
                           : new Date().toISOString(),
    };
    // Fire-and-forget with catch so it never blocks the ack
    dispatchActions(actions, ctx).catch((err) =>
      logger.error({ err: err.message }, 'alert-service: action dispatcher unexpected error'),
    );
  }

  // Push to WebSocket subscribers (use original tenant_id for routing key consistency)
  wsServer.broadcast(tenant_id, {
    type: 'alert.new',
    payload: newAlert,
  });
}

module.exports = { connectConsumer };
