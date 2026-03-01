'use strict';

/**
 * Action Dispatcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes the list of actions attached to a matched rule after an alert is
 * persisted. All dispatchers are non-fatal: a failure in one action must NEVER
 * prevent the alert from being recorded or other actions from running.
 *
 * Supported action formats
 * ────────────────────────
 * String shortcuts (all fall back to configured defaults):
 *   "notify"        → tries email → webhook in order of availability
 *   "notify_email"  → email using SMTP config / ALERT_EMAIL_RECIPIENT
 *   "webhook"       → HTTP POST using ALERT_WEBHOOK_URL
 *   "slack"         → Slack incoming webhook via SLACK_WEBHOOK_URL
 *
 * Rich objects (override every default):
 *   { type: "webhook",  url: "https://...", headers: {}, secret: "..." }
 *   { type: "slack",    webhook_url: "https://hooks.slack.com/..." }
 *   { type: "email",    to: "ops@company.com", subject: "..." }
 */

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../logger');

// ── Lazy-initialised mail transport ──────────────────────────────────────────
let _transport = null;

function _getTransport() {
  if (_transport) return _transport;
  const { smtp } = config.notifications;
  if (!smtp?.host) return null;
  _transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return _transport;
}

// ── HTTP helper (uses native fetch — Node ≥ 20) ───────────────────────────────
async function _httpPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.status;
}

// ── Payload builders ──────────────────────────────────────────────────────────
function _emailText(ctx) {
  return [
    `Alert: ${ctx.title}`,
    `Severity: ${ctx.severity.toUpperCase()}`,
    `Rule:     ${ctx.ruleName ?? 'N/A'}`,
    `Sensor:   ${ctx.sensorExternalId ?? 'N/A'}`,
    `Tenant:   ${ctx.tenantId}`,
    `Time:     ${ctx.triggeredAt}`,
    `Alert ID: ${ctx.alertId}`,
  ].join('\n');
}

function _emailHtml(ctx) {
  const COLORS = { low: '#4caf50', medium: '#ff9800', high: '#f44336', critical: '#7b1fa2' };
  const c = COLORS[ctx.severity] ?? '#607d8b';
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:${c};color:#fff;padding:14px 20px;border-radius:6px 6px 0 0">
    <h2 style="margin:0">🚨 SentinelEdge Alert</h2>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 6px 6px">
    <h3 style="margin-top:0">${ctx.title}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:600">Severity</td>
          <td style="padding:8px;color:${c};font-weight:700">${ctx.severity.toUpperCase()}</td></tr>
      <tr><td style="padding:8px;font-weight:600">Rule</td>
          <td style="padding:8px">${ctx.ruleName ?? 'N/A'}</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:600">Sensor</td>
          <td style="padding:8px">${ctx.sensorExternalId ?? 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:600">Tenant</td>
          <td style="padding:8px">${ctx.tenantId}</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:600">Time</td>
          <td style="padding:8px">${ctx.triggeredAt}</td></tr>
      <tr><td style="padding:8px;font-weight:600">Alert ID</td>
          <td style="padding:8px;font-size:11px;color:#888">${ctx.alertId}</td></tr>
    </table>
  </div>
  <p style="font-size:11px;color:#aaa;text-align:center;margin-top:8px">
    SentinelEdge Platform — automated alert notification
  </p>
</div>`;
}

function _webhookPayload(ctx) {
  return {
    event: 'alert.created',
    alert: {
      id:                 ctx.alertId,
      title:              ctx.title,
      severity:           ctx.severity,
      tenant_id:          ctx.tenantId,
      rule_id:            ctx.ruleId,
      rule_name:          ctx.ruleName,
      sensor_external_id: ctx.sensorExternalId,
      triggered_at:       ctx.triggeredAt,
    },
  };
}

function _slackPayload(ctx) {
  const COLORS = { low: '#4caf50', medium: '#ff9800', high: '#f44336', critical: '#7b1fa2' };
  return {
    attachments: [{
      color:  COLORS[ctx.severity] ?? '#607d8b',
      title:  `🚨 ${ctx.title}`,
      fields: [
        { title: 'Severity', value: ctx.severity.toUpperCase(), short: true  },
        { title: 'Rule',     value: ctx.ruleName ?? 'N/A',      short: true  },
        { title: 'Sensor',   value: ctx.sensorExternalId ?? 'N/A', short: true },
        { title: 'Tenant',   value: ctx.tenantId,                short: true },
      ],
      footer: `SentinelEdge • ${ctx.alertId}`,
      ts:     Math.floor(Date.now() / 1000),
    }],
  };
}

// ── Individual action handlers ────────────────────────────────────────────────

async function _sendEmail(to, ctx) {
  const transport = _getTransport();
  if (!transport) {
    logger.warn({ alertId: ctx.alertId }, 'action.email: skipped — SMTP not configured (set SMTP_HOST)');
    return;
  }
  await transport.sendMail({
    from:    config.notifications.smtp.from,
    to,
    subject: `[SentinelEdge] Alert: ${ctx.title}`,
    text:    _emailText(ctx),
    html:    _emailHtml(ctx),
  });
  logger.info({ alertId: ctx.alertId, to }, 'action.email: sent');
}

async function _sendWebhook(url, extraHeaders, secret, ctx) {
  const headers = { ...extraHeaders };
  if (secret) headers['X-SentinelEdge-Secret'] = secret;
  await _httpPost(url, _webhookPayload(ctx), headers);
  logger.info({ alertId: ctx.alertId, url }, 'action.webhook: dispatched');
}

async function _sendSlack(webhookUrl, ctx) {
  await _httpPost(webhookUrl, _slackPayload(ctx));
  logger.info({ alertId: ctx.alertId }, 'action.slack: dispatched');
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Dispatch all actions for a triggered alert.
 *
 * @param {Array}  actions  List of action strings or objects from the rule.
 * @param {Object} ctx      Alert context built in consumer.js.
 * @param {string} ctx.alertId
 * @param {string} ctx.title
 * @param {string} ctx.severity        low|medium|high|critical
 * @param {string} ctx.tenantId
 * @param {string} ctx.ruleId
 * @param {string} ctx.ruleName
 * @param {string} ctx.sensorExternalId
 * @param {string} ctx.triggeredAt     ISO timestamp
 */
async function dispatchActions(actions, ctx) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  const { notifications: n } = config;

  for (const action of actions) {
    const type =
      typeof action === 'string'
        ? action
        : typeof action?.type === 'string'
          ? action.type
          : null;

    if (!type) {
      logger.warn({ action, alertId: ctx.alertId }, 'action: malformed action, skipping');
      continue;
    }

    try {
      switch (type) {

        // ── email ──────────────────────────────────────────────────────────
        case 'notify_email':
        case 'email': {
          const to =
            (typeof action === 'object' && action.to)
            ?? n.defaultEmailRecipient;
          if (!to) {
            logger.warn({ alertId: ctx.alertId }, 'action.email: skipped — no recipient (set ALERT_EMAIL_RECIPIENT)');
            break;
          }
          await _sendEmail(to, ctx);
          break;
        }

        // ── webhook ────────────────────────────────────────────────────────
        case 'webhook': {
          const url =
            (typeof action === 'object' && action.url)
            ?? n.defaultWebhookUrl;
          if (!url) {
            logger.warn({ alertId: ctx.alertId }, 'action.webhook: skipped — no URL (set ALERT_WEBHOOK_URL)');
            break;
          }
          const headers = (typeof action === 'object' && action.headers) ?? {};
          const secret  = (typeof action === 'object' && action.secret)  ?? null;
          await _sendWebhook(url, headers, secret, ctx);
          break;
        }

        // ── slack ──────────────────────────────────────────────────────────
        case 'slack': {
          const webhookUrl =
            (typeof action === 'object' && action.webhook_url)
            ?? n.slackWebhookUrl;
          if (!webhookUrl) {
            logger.warn({ alertId: ctx.alertId }, 'action.slack: skipped — no webhook_url (set SLACK_WEBHOOK_URL)');
            break;
          }
          await _sendSlack(webhookUrl, ctx);
          break;
        }

        // ── notify (generic) ───────────────────────────────────────────────
        // Tries channels in order: email → webhook → slack → log-only
        case 'notify': {
          let dispatched = false;
          if (n.defaultEmailRecipient) {
            await _sendEmail(n.defaultEmailRecipient, ctx);
            dispatched = true;
          }
          if (n.defaultWebhookUrl) {
            await _sendWebhook(n.defaultWebhookUrl, {}, null, ctx);
            dispatched = true;
          }
          if (n.slackWebhookUrl) {
            await _sendSlack(n.slackWebhookUrl, ctx);
            dispatched = true;
          }
          if (!dispatched) {
            logger.info(
              { alertId: ctx.alertId, severity: ctx.severity, title: ctx.title },
              'action.notify: no channel configured — alert logged only',
            );
          }
          break;
        }

        default:
          logger.warn({ type, alertId: ctx.alertId }, 'action: unknown type, skipping');
      }
    } catch (err) {
      // Non-fatal: the alert already exists in DB; action failure must not
      // cause the message to be nack'd and requeued.
      logger.error(
        { type, alertId: ctx.alertId, err: err.message },
        'action: dispatch failed (non-fatal)',
      );
    }
  }
}

module.exports = { dispatchActions };
