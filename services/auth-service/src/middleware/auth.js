'use strict';

const { verifyToken } = require('../utils/jwt');
const { redis, keys } = require('../redis');
const logger = require('../logger');

/**
 * Middleware: verify JWT access token + inject req.user
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    // Check token blacklist (after logout)
    const blacklisted = await redis.get(keys.blacklist(payload.jti));
    if (blacklisted) {
      return res.status(401).json({ error: 'unauthorized', message: 'Token has been revoked' });
    }

    req.user = {
      id: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      email: payload.email,
      jti: payload.jti,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired', message: 'Access token expired' });
    }
    logger.warn({ err: err.message }, 'authenticate: invalid token');
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
  }
}

/**
 * Middleware factory: require specific roles
 * @param {...string} roles - Allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Role '${req.user.role}' is not authorized. Required: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
