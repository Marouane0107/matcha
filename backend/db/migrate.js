import { readFile } from 'node:fs/promises';
import { pool } from '../src/config/db.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./migrations/0001_mandatory.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Mandatory additive migration applied.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }