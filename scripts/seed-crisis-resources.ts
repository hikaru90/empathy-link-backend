/**
 * Seed default crisis resources. Run after migration.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { crisisResources } from '../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);

const DEFAULT_RESOURCES = [
	{ language: 'de', region: 'DE', name: 'Telefonseelsorge', description: 'Kostenlose Beratung bei Krisen, 24/7', phone: '0800 111 0 111 / 0800 111 0 222', url: 'https://online.telefonseelsorge.de', sortOrder: 0 },
	{ language: 'de', region: 'DE', name: 'Nummer gegen Kummer', description: 'Kostenlose Beratung für Kinder und Jugendliche', phone: '116 111', url: 'https://www.nummergegenkummer.de', sortOrder: 1 },
	{ language: 'de', region: 'DE', name: 'Seelsorge im Chat', description: 'Online-Beratung', url: 'https://online.telefonseelsorge.de', sortOrder: 2 },
	{ language: 'en', region: 'international', name: 'Find a Helpline', description: 'International crisis support directory', url: 'https://findahelpline.com', sortOrder: 0 },
	{ language: 'en', region: 'international', name: 'Crisis Text Line', description: 'Free, 24/7 support', phone: 'Text HOME to 741741', url: 'https://www.crisistextline.org', sortOrder: 1 },
];

async function seed() {
	for (const r of DEFAULT_RESOURCES) {
		const existing = await db.select().from(crisisResources).where(eq(crisisResources.name, r.name)).limit(1);
		if (existing.length === 0) {
			await db.insert(crisisResources).values(r);
			console.log('Inserted:', r.name);
		}
	}
	console.log('Done.');
}

seed().catch(console.error);
