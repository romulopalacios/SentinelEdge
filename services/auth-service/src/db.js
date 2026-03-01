'use strict';

const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const pool = new Pool(config.db);

pool.on('connect', () => {
  logger.info('PostgreSQL: new client connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL: unexpected client error');
});

/**
 * Execute a query with automatic connection management.
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  logger.debug({ query: text, duration: Date.now() - start, rows: result.rowCount }, 'db.query');
  return result;
}

/**
 * Get a client for transactions.
 * Always call client.release() in a finally block.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
