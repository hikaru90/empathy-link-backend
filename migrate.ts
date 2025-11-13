import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import 'dotenv/config';

const db = drizzle(process.env.DATABASE_URL!);

await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migration complete!');
process.exit(0);
