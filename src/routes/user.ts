import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { user as userTable } from '../../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);
const user = new Hono();

// GET /api/user/chat-settings - Get user chat settings
user.get('/chat-settings', async (c: Context) => {
	const authUser = c.get('user');
	if (!authUser) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// Get user with chat settings
		const userData = await db
			.select({
				aiAnswerLength: userTable.aiAnswerLength,
				toneOfVoice: userTable.toneOfVoice,
				nvcKnowledge: userTable.nvcKnowledge,
			})
			.from(userTable)
			.where(eq(userTable.id, authUser.id))
			.limit(1);

		if (!userData || userData.length === 0) {
			return c.json({ error: 'User not found' }, 404);
		}

		const settings = userData[0];

		// Return with defaults if not set
		return c.json({
			aiAnswerLength: settings.aiAnswerLength || 'short',
			toneOfVoice: settings.toneOfVoice || 'heartfelt',
			nvcKnowledge: settings.nvcKnowledge || 'beginner',
		});
	} catch (error) {
		console.error('Error fetching chat settings:', error);
		return c.json({ error: 'Failed to fetch chat settings' }, 500);
	}
});

// POST /api/user/chat-settings - Update user chat settings
user.post('/chat-settings', async (c: Context) => {
	const authUser = c.get('user');
	if (!authUser) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { aiAnswerLength, toneOfVoice, nvcKnowledge } = body;

		// Validate values
		const validAnswerLengths = ['short', 'medium', 'long'];
		const validTones = ['analytical', 'heartfelt'];
		const validKnowledge = ['beginner', 'intermediate', 'advanced'];

		if (aiAnswerLength && !validAnswerLengths.includes(aiAnswerLength)) {
			return c.json({ error: 'Invalid aiAnswerLength value' }, 400);
		}

		if (toneOfVoice && !validTones.includes(toneOfVoice)) {
			return c.json({ error: 'Invalid toneOfVoice value' }, 400);
		}

		if (nvcKnowledge && !validKnowledge.includes(nvcKnowledge)) {
			return c.json({ error: 'Invalid nvcKnowledge value' }, 400);
		}

		// Build update object with only provided fields
		const updateData: {
			aiAnswerLength?: string;
			toneOfVoice?: string;
			nvcKnowledge?: string;
		} = {};

		if (aiAnswerLength) updateData.aiAnswerLength = aiAnswerLength;
		if (toneOfVoice) updateData.toneOfVoice = toneOfVoice;
		if (nvcKnowledge) updateData.nvcKnowledge = nvcKnowledge;

		// Update user settings
		await db
			.update(userTable)
			.set(updateData)
			.where(eq(userTable.id, authUser.id));

		return c.json({
			success: true,
			message: 'Einstellungen erfolgreich gespeichert!',
		});
	} catch (error) {
		console.error('Error updating chat settings:', error);
		return c.json({ error: 'Failed to update chat settings' }, 500);
	}
});

export default user;
