'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const logger = require('./logger');
const { pool } = require('./db');
const { redis } = require('./redis');

const authRoutes  = require('./routes/auth');
const usersRoutes = require('./routes/users');

const app = express();

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Correlation ID per request
app.use((req, _res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  next();
});

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
      correlationId: req.correlationId,
    }, 'request');
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',  authRoutes);
app.use('/api/v1/users', usersRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisPing = await redis.ping();
    res.json({
      status: 'ok',
      service: 'auth-service',
      db: 'ok',
      redis: redisPing === 'PONG' ? 'ok' : 'error',
      uptime: process.uptime(),
    });
  } catch (err) {
    logger.error({ err }, 'health check failed');
    res.status(503).json({ status: 'error', service: 'auth-service' });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  await redis.connect();

  app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'Auth Service started');
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await pool.end();
  await redis.quit();
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
