'use strict';

const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: config.env === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'auth-service', env: config.env },
  redact: ['req.headers.authorization', 'body.password', 'body.password_hash'],
});

module.exports = logger;
