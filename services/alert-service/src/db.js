'use strict';

const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const pool = new Pool(config.db);
pool.on('error', (err) => logger.error({ err }, 'PostgreSQL: unexpected error'));

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
