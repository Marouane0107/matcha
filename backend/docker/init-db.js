import { pool } from '../src/config/db.js';
import { seedDatabase } from '../db/seed.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDb() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await sleep(2000);
    }
  }
  throw new Error('Database did not become ready in time');
}

async function main() {
  await waitForDb();

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    console.log('Seeding database (first run)...');
    await seedDatabase();
  } else {
    console.log('Database already seeded; skipping.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Database init failed:', err);
  process.exit(1);
});
