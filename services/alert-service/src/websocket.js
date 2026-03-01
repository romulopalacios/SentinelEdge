'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const logger = require('./logger');

/**
 * WebSocket server with per-tenant broadcast.
 * Clients connect to /ws?token=<access_token>
 */
class AlertWebSocketServer {
  constructor() {
    this._wss = null;
    // Map: tenantId → Set<WebSocket>
    this._tenantClients = new Map();
  }

  attach(server) {
    this._wss = new WebSocketServer({ server, path: '/ws' });

    this._wss.on('connection', (ws, req) => {
      const tenant = this._authenticate(req);
      if (!tenant) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      // Register client
      if (!this._tenantClients.has(tenant.id)) {
        this._tenantClients.set(tenant.id, new Set());
      }
      this._tenantClients.get(tenant.id).add(ws);

      logger.info({ tenantId: tenant.id }, 'ws: client connected');

      ws.on('close', () => {
        this._tenantClients.get(tenant.id)?.delete(ws);
        logger.debug({ tenantId: tenant.id }, 'ws: client disconnected');
      });

      ws.on('error', (err) => logger.warn({ err: err.message }, 'ws: client error'));

      // Send welcome message
      ws.send(JSON.stringify({ type: 'connected', tenant_id: tenant.id }));
    });

    logger.info('ws: WebSocket server attached');
  }

  _authenticate(req) {
    try {
      const url = new URL(`ws://localhost${req.url}`);
      const token = url.searchParams.get('token');
      if (!token) return null;
      const payload = jwt.verify(token, config.jwt.secret, { algorithms: [config.jwt.algorithm] });
      return { id: payload.tenant_id };
    } catch {
      return null;
    }
  }

  /**
   * Broadcast a message to all WebSocket clients of a tenant.
   */
  broadcast(tenantId, message) {
    const clients = this._tenantClients.get(tenantId);
    if (!clients?.size) return;

    const data = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
    logger.debug({ tenantId, clients: clients.size }, 'ws: broadcast sent');
  }
}

module.exports = { AlertWebSocketServer };
