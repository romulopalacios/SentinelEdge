'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

// All user routes require auth
router.use(authenticate);

const createUserSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  full_name: Joi.string().max(255).optional(),
  role: Joi.string().valid('admin', 'operator', 'viewer').default('viewer'),
});

const updateUserSchema = Joi.object({
  full_name: Joi.string().max(255).optional(),
  role: Joi.string().valid('admin', 'operator', 'viewer').optional(),
  is_active: Joi.boolean().optional(),
  password: Joi.string().min(8).max(128).optional(),
});

// ── GET /api/v1/users ─────────────────────────────────────────────────────────

router.get('/', requireRole('admin', 'operator'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, role, is_active, last_login_at, created_at
       FROM users WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user.tenantId]
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, 'users.list: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── GET /api/v1/users/:id ─────────────────────────────────────────────────────

router.get('/:id', requireRole('admin', 'operator'), async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active, last_login_at, created_at FROM users WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'users.get: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── POST /api/v1/users (create user in same tenant) ──────────────────────────

router.post('/', requireRole('admin'), async (req, res) => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'validation_error', message: error.message });

  const { email, password, full_name, role } = value;

  try {
    const password_hash = await bcrypt.hash(password, config.bcrypt.saltRounds);
    const { rows } = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [req.user.tenantId, email, password_hash, full_name || null, role]
    );
    logger.info({ userId: rows[0].id, tenantId: req.user.tenantId }, 'users.create: success');
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.constraint === 'users_tenant_id_email_key') {
      return res.status(409).json({ error: 'conflict', message: 'Email already exists in this tenant' });
    }
    logger.error({ err }, 'users.create: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── PATCH /api/v1/users/:id ───────────────────────────────────────────────────

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const { error, value } = updateUserSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'validation_error', message: error.message });

  const updates = { ...value };

  if (updates.password) {
    updates.password_hash = await bcrypt.hash(updates.password, config.bcrypt.saltRounds);
    delete updates.password;
  }

  const fields = Object.keys(updates);
  if (!fields.length) return res.status(400).json({ error: 'no_fields', message: 'No fields to update' });

  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = [req.params.id, req.user.tenantId, ...fields.map((f) => updates[f])];

  try {
    const { rows } = await query(
      `UPDATE users SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, email, full_name, role, is_active, updated_at`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'users.update: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ── DELETE /api/v1/users/:id (soft-delete) ────────────────────────────────────

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'bad_request', message: 'Cannot delete your own account' });
    }
    const { rows } = await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.user.tenantId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, 'users.delete: error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
