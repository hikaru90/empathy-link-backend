/**
 * Database client singleton
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema.js';
import 'dotenv/config';

// Initialize database connection
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	throw new Error('DATABASE_URL environment variable is required');
}

export const db = drizzle(dbUrl, { schema });
