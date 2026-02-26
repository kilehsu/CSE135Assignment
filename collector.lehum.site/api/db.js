'use strict';

/**
 * db.js — PostgreSQL connection pool
 *
 * Reads DATABASE_URL from the environment (.env file or system env).
 * Usage: const pool = require('./db');
 *        const { rows } = await pool.query('SELECT ...', [...]);
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable SSL only when DB_SSL=true is set (e.g. for managed cloud DBs)
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle-client error:', err.message);
});

module.exports = pool;
