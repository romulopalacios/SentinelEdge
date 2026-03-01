'use strict';

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  db: {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
  },

  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },

  rateLimit: {
    authRpm: parseInt(process.env.RATE_LIMIT_AUTH_RPM || '20', 10),
    apiRpm: parseInt(process.env.RATE_LIMIT_API_RPM || '300', 10),
  },
};

// Validate required
if (!config.jwt.secret) throw new Error('JWT_SECRET is required');
if (!config.db.connectionString) throw new Error('DATABASE_URL is required');

module.exports = config;
