'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

/**
 * Sign an access token (short-lived)
 */
function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.accessExpiresIn,
    issuer: 'sentineledge',
  });
}

/**
 * Sign a refresh token (long-lived, stored hashed in DB)
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'sentineledge',
  });
}

/**
 * Verify any token
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: [config.jwt.algorithm],
    issuer: 'sentineledge',
  });
}

/**
 * Hash a refresh token for secure DB storage (SHA-256)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calculate expiry Date from JWT expiresIn string (e.g. '7d')
 */
function expiryDate(expiresIn) {
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiresIn: ${expiresIn}`);
  const seconds = parseInt(match[1], 10) * units[match[2]];
  return new Date(Date.now() + seconds * 1000);
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, hashToken, expiryDate };
