import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, asc } from 'drizzle-orm';
import { feelings as feelingsTable, needs as needsTable } from '../../drizzle/schema.js';
import { feelingsData } from '../lib/data/feelings.js';
import { needsData } from '../lib/data/needs.js';

const db = drizzle(process.env.DATABASE_URL!);
const data = new Hono();

// Helper function to populate feelings table with default data
async function populateFeelings() {
	console.log('Populating feelings table with default data...');

	for (const feeling of feelingsData) {
		try {
			await db.insert(feelingsTable).values({
				id: crypto.randomUUID(),
				nameDE: feeling.nameDE,
				nameEN: feeling.nameEN,
				category: feeling.category || '',
				positive: feeling.positive,
				sort: feeling.sort
			});
		} catch (error) {
			console.error(`Failed to insert feeling ${feeling.nameDE}:`, error);
		}
	}

	console.log(`✅ Populated ${feelingsData.length} feelings`);
}

// GET /api/data/feelings - Get all feelings
data.get('/feelings', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Get all feelings sorted by: negative first (positive=false DESC), then by category, then by sort
		// Note: In the SvelteKit app, the sort is '-positive,category,sort'
		// The '-' means descending, so negative feelings (false) come first
		let feelings = await db
			.select()
			.from(feelingsTable)
			.orderBy(desc(feelingsTable.positive), asc(feelingsTable.category), asc(feelingsTable.sort));

		// If no feelings exist, populate with default data
		if (feelings.length === 0) {
			console.log('No feelings found, populating with default data...');
			await populateFeelings();
			// Fetch again after populating
			feelings = await db
				.select()
				.from(feelingsTable)
				.orderBy(desc(feelingsTable.positive), asc(feelingsTable.category), asc(feelingsTable.sort));
		}

		return c.json({ feelings });
	} catch (error) {
		console.error('Error fetching feelings:', error);
		return c.json({ error: 'Failed to fetch feelings' }, 500);
	}
});

// Helper function to populate needs table with default data
async function populateNeeds() {
	console.log('Populating needs table with default data...');

	// Category translations
	const categoryTranslations: Record<string, string> = {
		'Celebration': 'Feiern',
		'Contributing to the enrichment of life': 'Zum Leben beitragen',
		'Integrity/Alignment with oneself': 'Integrität/Stimmigkeit mit sich selbst',
		'Interdependence/Contact with others': 'Interdependenz/Kontakt mit anderen',
		'Physical health': 'Körperliche Gesundheit',
		'Self-determination/Autonomy': 'Selbstbestimmung/Autonomie',
		'Spirituality': 'Spiritualität'
	};

	for (const need of needsData) {
		try {
			await db.insert(needsTable).values({
				id: need.id,
				nameDE: need.nameDE,
				nameEN: need.nameEN,
				category: need.category || '',
				categoryDE: categoryTranslations[need.category] || need.category,
				sort: need.sort
			});
		} catch (error) {
			console.error(`Failed to insert need ${need.nameDE}:`, error);
		}
	}

	console.log(`✅ Populated ${needsData.length} needs`);
}

// GET /api/data/needs - Get all needs
data.get('/needs', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Get all needs sorted by category, then by sort
		let needs = await db
			.select()
			.from(needsTable)
			.orderBy(asc(needsTable.category), asc(needsTable.sort));

		// If no needs exist, populate with default data
		if (needs.length === 0) {
			console.log('No needs found, populating with default data...');
			await populateNeeds();
			// Fetch again after populating
			needs = await db
				.select()
				.from(needsTable)
				.orderBy(asc(needsTable.category), asc(needsTable.sort));
		}

		return c.json({ needs });
	} catch (error) {
		console.error('Error fetching needs:', error);
		return c.json({ error: 'Failed to fetch needs' }, 500);
	}
});

// OLD STATIC DATA (kept for reference, can be deleted)
/*
		const needs = [
			{ id: '1', nameEN: 'Self-determination/Autonomy', nameDE: 'Selbstbestimmung/Autonomie', category: 'Self-determination/Autonomy', sort: 1 },
			{ id: '2', nameEN: 'Determining for oneself what one does, how, when, why, etc.', nameDE: 'Selbst bestimmen, was man tut, wie, wann, warum etc.', category: 'Self-determination/Autonomy', sort: 2 },
			{ id: '3', nameEN: 'Freedom, Independence', nameDE: 'Freiheit, Unabhängigkeit', category: 'Self-determination/Autonomy', sort: 3 },
			{ id: '4', nameEN: 'Self-actualization, Learning, Inner Growth', nameDE: 'Selbstentfaltung, Lernen, inneres Wachstum', category: 'Self-determination/Autonomy', sort: 4 },
			{ id: '5', nameEN: 'Self-efficacy', nameDE: 'Selbstwirksamkeit', category: 'Self-determination/Autonomy', sort: 5 },
			{ id: '6', nameEN: 'Integrity/Alignment with oneself', nameDE: 'Integrität/Stimmigkeit mit sich selbst', category: 'Integrity/Alignment with oneself', sort: 6 },
			{ id: '7', nameEN: 'Self-responsibility', nameDE: 'Selbstverantwortung', category: 'Integrity/Alignment with oneself', sort: 7 },
			{ id: '8', nameEN: 'Authenticity', nameDE: 'Authentizität', category: 'Integrity/Alignment with oneself', sort: 8 },
			{ id: '9', nameEN: 'Creativity', nameDE: 'Kreativität', category: 'Integrity/Alignment with oneself', sort: 9 },
			{ id: '10', nameEN: 'Meaningfulness', nameDE: 'Sinnhaftigkeit', category: 'Integrity/Alignment with oneself', sort: 10 },
			{ id: '11', nameEN: 'Self-worth, Self-respect', nameDE: 'Selbstwert, Selbstrespekt', category: 'Integrity/Alignment with oneself', sort: 11 },
			{ id: '12', nameEN: 'Learning, Maturing, Growing', nameDE: 'Lernen, Reifen, Wachsen', category: 'Integrity/Alignment with oneself', sort: 12 },
			{ id: '13', nameEN: 'Self-confidence', nameDE: 'Selbstvertrauen', category: 'Integrity/Alignment with oneself', sort: 13 },
			{ id: '14', nameEN: 'Self-care', nameDE: 'Selbstfürsorge', category: 'Integrity/Alignment with oneself', sort: 14 },
			{ id: '15', nameEN: 'Self-acceptance', nameDE: 'Selbstannahme', category: 'Integrity/Alignment with oneself', sort: 15 },
			{ id: '16', nameEN: 'Mindfulness, Being awake, Being present', nameDE: 'Achtsamkeit, wach sein, präsent sein', category: 'Integrity/Alignment with oneself', sort: 16 },
			{ id: '17', nameEN: 'Contributing to the enrichment of life', nameDE: 'Zur Bereicherung des Lebens beitragen', category: 'Contributing to the enrichment of life', sort: 17 },
			{ id: '18', nameEN: 'Caring for the well-being of loved beings', nameDE: 'Fürsorge, sich um das Wohl geliebter Wesen kümmern', category: 'Contributing to the enrichment of life', sort: 18 },
			{ id: '19', nameEN: 'Ensuring survival', nameDE: 'Das Überleben sichern', category: 'Contributing to the enrichment of life', sort: 19 },
			{ id: '20', nameEN: 'Using one\'s own energy meaningfully', nameDE: 'Die eigene Energie sinnvoll einsetzen', category: 'Contributing to the enrichment of life', sort: 20 },
			{ id: '21', nameEN: 'Celebration', nameDE: 'Feiern', category: 'Celebration', sort: 21 },
			{ id: '22', nameEN: 'Celebrating the creation of a fulfilling life and realized dreams', nameDE: 'Die Gestaltung eines erfüllten Lebens und wahr gewordene Träume feiern', category: 'Celebration', sort: 22 },
			{ id: '23', nameEN: 'Expressing joy of life', nameDE: 'Die Lebensfreude ausdrücken', category: 'Celebration', sort: 23 },
			{ id: '24', nameEN: 'Mourning, solemnly commemorating losses and farewells: of loved ones, dreams', nameDE: 'Trauern, Verluste und Abschiede feierlich begehen: von geliebten Menschen, Träumen', category: 'Celebration', sort: 24 },
			{ id: '25', nameEN: 'Spirituality', nameDE: 'Spiritualität', category: 'Spirituality', sort: 25 },
			{ id: '26', nameEN: 'Beauty', nameDE: 'Schönheit', category: 'Spirituality', sort: 26 },
			{ id: '27', nameEN: 'Aesthetics', nameDE: 'Ästhetik', category: 'Spirituality', sort: 27 },
			{ id: '28', nameEN: 'Harmony', nameDE: 'Harmonie', category: 'Spirituality', sort: 28 },
			{ id: '29', nameEN: 'Mental orientation', nameDE: 'Geistige Orientierung', category: 'Spirituality', sort: 29 },
			{ id: '30', nameEN: 'Order', nameDE: 'Ordnung', category: 'Spirituality', sort: 30 },
			{ id: '31', nameEN: 'Peace', nameDE: 'Frieden', category: 'Spirituality', sort: 31 },
			{ id: '32', nameEN: 'Inspiration', nameDE: 'Inspiration', category: 'Spirituality', sort: 32 },
			{ id: '33', nameEN: 'Hope', nameDE: 'Hoffnung', category: 'Spirituality', sort: 33 },
			{ id: '34', nameEN: 'To be accepted, acknowledged', nameDE: 'Angenommen, anerkannt werden', category: 'Connection', sort: 34 },
			{ id: '35', nameEN: 'Affection, closeness, warmth, love, affinity', nameDE: 'Zuneigung, Nähe, Wärme, Liebe, Verbundenheit', category: 'Connection', sort: 35 },
			{ id: '36', nameEN: 'Care', nameDE: 'Fürsorge', category: 'Connection', sort: 36 },
			{ id: '37', nameEN: 'Appreciation, affirmation, encouragement', nameDE: 'Wertschätzung, Bestätigung, Ermutigung', category: 'Connection', sort: 37 },
			{ id: '38', nameEN: 'To be perceived, seen, heard', nameDE: 'Wahrgenommen, gesehen, gehört werden', category: 'Connection', sort: 38 },
			{ id: '39', nameEN: 'Understanding, empathy', nameDE: 'Verständnis, Einfühlung', category: 'Connection', sort: 39 },
			{ id: '40', nameEN: 'To give/receive', nameDE: 'Geben/Nehmen', category: 'Connection', sort: 40 },
			{ id: '41', nameEN: 'Trust', nameDE: 'Vertrauen', category: 'Connection', sort: 41 },
			{ id: '42', nameEN: 'Respect', nameDE: 'Respekt', category: 'Connection', sort: 42 },
			{ id: '43', nameEN: 'Contact, intimacy, sexual expression', nameDE: 'Kontakt, Intimität, sexueller Ausdruck', category: 'Connection', sort: 43 },
			{ id: '44', nameEN: 'To mourn together', nameDE: 'Gemeinsam trauern', category: 'Connection', sort: 44 },
			{ id: '45', nameEN: 'Bonding, belonging', nameDE: 'Bindung, Zugehörigkeit', category: 'Connection', sort: 45 },
			{ id: '46', nameEN: 'Support, mutuality', nameDE: 'Unterstützung, Gegenseitigkeit', category: 'Connection', sort: 46 },
			{ id: '47', nameEN: 'Exchange, communication, contact', nameDE: 'Austausch, Kommunikation, Kontakt', category: 'Connection', sort: 47 },
			{ id: '48', nameEN: 'To matter', nameDE: 'Von Bedeutung sein', category: 'Connection', sort: 48 },
			{ id: '49', nameEN: 'Consideration', nameDE: 'Rücksichtnahme', category: 'Connection', sort: 49 },
			{ id: '50', nameEN: 'Equality, fairness, justice', nameDE: 'Gleichwertigkeit, Fairness, Gerechtigkeit', category: 'Connection', sort: 50 },
			{ id: '51', nameEN: 'Consistency, reliability', nameDE: 'Beständigkeit, Verlässlichkeit', category: 'Connection', sort: 51 },
			{ id: '52', nameEN: 'Honesty, authenticity, congruence', nameDE: 'Ehrlichkeit, Authentizität, Stimmigkeit', category: 'Connection', sort: 52 },
			{ id: '53', nameEN: 'Security, Protection', nameDE: 'Sicherheit, Schutz', category: 'Physical Well-being', sort: 53 },
			{ id: '54', nameEN: 'Physical, emotional security, protection from harm', nameDE: 'Körperliche, emotionale Sicherheit, Schutz vor Schaden', category: 'Physical Well-being', sort: 54 },
			{ id: '55', nameEN: 'Health, well-being', nameDE: 'Gesundheit, Wohlergehen', category: 'Physical Well-being', sort: 55 },
			{ id: '56', nameEN: 'Life, viability, vitality, thriving', nameDE: 'Leben, Lebensfähigkeit, Vitalität, Entfaltung', category: 'Physical Well-being', sort: 56 },
			{ id: '57', nameEN: 'Sustenance, nutrition, physical nourishment', nameDE: 'Lebensunterhalt, Ernährung, körperliche Nahrung', category: 'Physical Well-being', sort: 57 },
			{ id: '58', nameEN: 'Care, nurturing', nameDE: 'Pflege, Fürsorge', category: 'Physical Well-being', sort: 58 },
			{ id: '59', nameEN: 'Air, Water, Light', nameDE: 'Luft, Wasser, Licht', category: 'Physical Well-being', sort: 59 },
			{ id: '60', nameEN: 'Shelter, protection from environmental influences', nameDE: 'Unterkunft, Schutz vor Umwelteinflüssen', category: 'Physical Well-being', sort: 60 },
			{ id: '61', nameEN: 'Rest, sleep, recuperation, recovery', nameDE: 'Ruhe, Schlaf, Erholung, Regeneration', category: 'Physical Well-being', sort: 61 },
			{ id: '62', nameEN: 'Movement, activity, exercise', nameDE: 'Bewegung, Aktivität, Sport', category: 'Physical Well-being', sort: 62 },
			{ id: '63', nameEN: 'Sexual expression', nameDE: 'Sexueller Ausdruck', category: 'Physical Well-being', sort: 63 },
			{ id: '64', nameEN: 'Fun, Enjoyment', nameDE: 'Spaß, Vergnügen', category: 'Fun, Enjoyment', sort: 64 },
			{ id: '65', nameEN: 'Play, lightness', nameDE: 'Spiel, Leichtigkeit', category: 'Fun, Enjoyment', sort: 65 },
			{ id: '66', nameEN: 'Laughing, humor', nameDE: 'Lachen, Humor', category: 'Fun, Enjoyment', sort: 66 },
			{ id: '67', nameEN: 'Ease, fun', nameDE: 'Leichtigkeit, Spaß', category: 'Fun, Enjoyment', sort: 67 },
			{ id: '68', nameEN: 'Predictability', nameDE: 'Vorhersehbarkeit', category: 'Predictability', sort: 68 },
			{ id: '69', nameEN: 'Structure, planning', nameDE: 'Struktur, Planung', category: 'Predictability', sort: 69 },
			{ id: '70', nameEN: 'Routine, familiarity', nameDE: 'Routine, Vertrautheit', category: 'Predictability', sort: 70 },
			{ id: '71', nameEN: 'Consistency, reliability', nameDE: 'Beständigkeit, Verlässlichkeit', category: 'Predictability', sort: 71 },
			{ id: '72', nameEN: 'Orientation, to know where one stands', nameDE: 'Orientierung, wissen, woran man ist', category: 'Predictability', sort: 72 },
			{ id: '73', nameEN: 'Stability', nameDE: 'Stabilität', category: 'Predictability', sort: 73 },
			{ id: '74', nameEN: 'Understanding, clarity', nameDE: 'Verständnis, Klarheit', category: 'Understanding, clarity', sort: 74 },
			{ id: '75', nameEN: 'Clarity, insight, knowledge, meaning', nameDE: 'Klarheit, Einsicht, Wissen, Bedeutung', category: 'Understanding, clarity', sort: 75 },
			{ id: '76', nameEN: 'Awareness, consciousness', nameDE: 'Bewusstheit', category: 'Understanding, clarity', sort: 76 },
			{ id: '77', nameEN: 'Efficiency', nameDE: 'Effizienz', category: 'Understanding, clarity', sort: 77 },
			{ id: '78', nameEN: 'To be heard, taken seriously', nameDE: 'Gehört, ernst genommen werden', category: 'Understanding, clarity', sort: 78 },
			{ id: '79', nameEN: 'To explore, discover, newness', nameDE: 'Erkunden, entdecken, Neues', category: 'Understanding, clarity', sort: 79 },
			{ id: '80', nameEN: 'Stimulation, challenge', nameDE: 'Anregung, Herausforderung', category: 'Understanding, clarity', sort: 80 },
		];
*/

export default data;
