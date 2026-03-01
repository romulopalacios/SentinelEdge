'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { redis, keys } = require('../redis');
const {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  expiryDate,
} = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  tenant_slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(3).max(100).required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  full_name: Joi.string().max(255).optional(),
  role: Joi.string().valid('admin', 'operator', 'viewer').default('viewer'),
  tenant_slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(3).max(100).required(),
});

const refreshSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

// ── Helper: build token pair ──────────────────────────────────────────────────

function buildTokens(user) {
  const jti = uuidv4();
  const payload = {
    sub: user.id,
    jti,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ ...payload, type: 'refresh' });
  return { accessToken, refreshToken, jti };
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'validation_error', message: error.message });

  const { email, password, tenant_slug } = value;

  try {
    // Tenant validation
    const tenantRes = await query(
      'SELECT id FROM tenants WHERE slug = $1 AND is_active = true',
      [tenant_slug]
    );
    if (!tenantRes.rows.length) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
    }
    const tenant = tenantRes.rows[0];

    // User lookup
    const userRes = await query(
      'SELECT id, tenant_id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1 AND tenant_id = $2',
      [email, tenant.id]
    );
    const user = userRes.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
    }

    // Password verification
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = buildTokens(user);
    const refreshHash = hashToken(refreshToken);
    const expiresAt = expiryDate(config.jwt.refreshExpiresIn);

    // Persist refresh token
    await query(
      'INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [user.id, user.tenant_id, refreshHash, expiresAt]
    );

    // Update last_login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    logger.info({ userId: user.id, tenantId: user.tenant_id }, 'auth.login: success');

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: config.jwt.accessExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tenant_id: user.tenant_id,
      },
    });
  } catch (err) {
    logger.error({ err }, 'auth.login: error');
    return res.status(500).json({ error: 'internal_error', message: 'Login failed' });
  }
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const { error, value } = refreshSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'validation_error', message: error.message });

  const { refresh_token } = value;

  try {
    const payload = verifyToken(refresh_token);
    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid token type' });
    }

    const tokenHash = hashToken(refresh_token);
    const tokenRes = await query(
      'SELECT id, user_id, tenant_id FROM refresh_tokens WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()',
      [tokenHash]
    );

    if (!tokenRes.rows.length) {
      return res.status(401).json({ error: 'unauthorized', message: 'Refresh token invalid or expired' });
    }

    const { user_id, tenant_id, id: tokenId } = tokenRes.rows[0];

    // Fetch fresh user data
    const userRes = await query(
      'SELECT id, tenant_id, email, role, is_active FROM users WHERE id = $1 AND is_active = true',
      [user_id]
    );
    if (!userRes.rows.length) {
      return res.status(401).json({ error: 'unauthorized', message: 'User not found or inactive' });
    }
    const user = userRes.rows[0];

    // Rotate: revoke old, issue new
    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [tokenId]);

    const { accessToken, refreshToken: newRefreshToken } = buildTokens(user);
    const newHash = hashToken(newRefreshToken);
    const expiresAt = expiryDate(config.jwt.refreshExpiresIn);

    await query(
      'INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [user_id, tenant_id, newHash, expiresAt]
    );

    return res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired', message: 'Refresh token expired' });
    }
    logger.error({ err }, 'auth.refresh: error');
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid refresh token' });
  }
});

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

router.post('/logout', authenticate, async (req, res) => {
  try {
    const { id: userId, jti } = req.user;

    // Blacklist current access token until its natural expiry
    const payload = verifyToken(req.headers.authorization.slice(7));
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.setex(keys.blacklist(jti), ttl, '1');
    }

    // Revoke all refresh tokens for this user
    await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false', [userId]);

    logger.info({ userId }, 'auth.logout: success');
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err }, 'auth.logout: error');
    return res.status(500).json({ error: 'internal_error', message: 'Logout failed' });
  }
});

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  try {
    const userRes = await query(
      'SELECT id, tenant_id, email, full_name, role, is_active, last_login_at, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }
    return res.json(userRes.rows[0]);
  } catch (err) {
    logger.error({ err }, 'auth.me: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
