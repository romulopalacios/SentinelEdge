'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const logger = require('./logger');
const { pool } = require('./db');
const { AlertWebSocketServer } = require('./websocket');
const { connectConsumer } = require('./consumer');

const app = express();
app.use(express.json({ limit: '128kb' }));

// Correlation ID
app.use((req, _res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'alert-service', uptime: process.uptime() });
  } catch (err) {
    logger.error({ err }, 'health check failed');
    res.status(503).json({ status: 'error', service: 'alert-service' });
  }
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  const wsServer = new AlertWebSocketServer();
  const server = http.createServer(app);

  // Attach WebSocket server (handles /ws path)
  wsServer.attach(server);

  // Start consuming RabbitMQ events
  await connectConsumer(wsServer);

  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'Alert Service started');
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM — shutting down');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
  process.exit(1);
});

start().catch((err) => {
  logger.error({ err }, 'startup failed');
  process.exit(1);
});
