'use strict';

const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('Redis: connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis: connection error'));

// Key builders
const keys = {
  refreshToken: (tokenHash) => `auth:refresh:${tokenHash}`,
  blacklist: (jti) => `auth:blacklist:${jti}`,
  rateLimit: (ip) => `rate:auth:${ip}`,
};

module.exports = { redis, keys };
