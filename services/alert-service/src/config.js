'use strict';

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3002', 10),

  db: {
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672/perimetral',
    alertsExchange: 'perimetral.alerts',
    alertsQueue: 'alert-dispatcher-queue',
    prefetch: 20,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
  },

  // ── Notification channels (all optional — gracefully skipped if missing) ──
  notifications: {
    // Generic fallbacks used when an action is a plain string (e.g. "notify")
    defaultEmailRecipient: process.env.ALERT_EMAIL_RECIPIENT || null,
    defaultWebhookUrl:     process.env.ALERT_WEBHOOK_URL     || null,
    slackWebhookUrl:       process.env.SLACK_WEBHOOK_URL     || null,

    smtp: {
      host:   process.env.SMTP_HOST   || null,
      port:   parseInt(process.env.SMTP_PORT   || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user:   process.env.SMTP_USER   || null,
      pass:   process.env.SMTP_PASS   || null,
      from:   process.env.SMTP_FROM   || 'alerts@sentineledge.local',
    },
  },
};

if (!config.db.connectionString) throw new Error('DATABASE_URL is required');
if (!config.jwt.secret) throw new Error('JWT_SECRET is required');

module.exports = config;
