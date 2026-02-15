import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

async function main() {
  console.log('Cleaning up email_templates tables...');
  try {
    await db.execute(sql`DROP TABLE IF EXISTS "email_template_versions" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "email_templates" CASCADE;`);
    await db.execute(sql`DELETE FROM "__drizzle_migrations" WHERE tag = '0020_email_templates';`);
    console.log('Migration history cleaned.');
  } catch (error) {
    console.error('Error dropping tables:', error);
  } finally {
    await pool.end();
  }
}

main();
