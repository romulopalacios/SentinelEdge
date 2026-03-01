'use strict';

const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: config.env === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'alert-service', env: config.env },
});

module.exports = logger;
