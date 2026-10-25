import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function resetDatabase() {
  console.log('🔄 Resetting database schema...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop all tables in dependency order
    await client.query(`
      DROP TABLE IF EXISTS tokens CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS blocks CASCADE;
      DROP TABLE IF EXISTS visits CASCADE;
      DROP TABLE IF EXISTS likes CASCADE;
      DROP TABLE IF EXISTS photos CASCADE;
      DROP TABLE IF EXISTS user_tags CASCADE;
      DROP TABLE IF EXISTS tags CASCADE;
      DROP TABLE IF EXISTS profiles CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Execute schema.sql
    await client.query(schemaSql);

    await client.query('COMMIT');
    console.log('✅ Database schema reset successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error resetting database schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if called as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
