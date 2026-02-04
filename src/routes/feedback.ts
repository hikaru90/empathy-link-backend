import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { userFeedback } from '../../drizzle/schema.js';
import { db } from '../lib/db.js';

const feedback = new Hono();

const FEEDBACK_TYPES = ['bug', 'improvement', 'other'] as const;

// POST /api/feedback - Submit user feedback (bug, improvement, etc.)
feedback.post('/', async (c: Context) => {
	const authUser = c.get('user');
	if (!authUser) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json();
		const { type, title, message, observation, feelings, needs, request, metadata } = body;

		if (!type || !FEEDBACK_TYPES.includes(type)) {
			return c.json(
				{ error: 'Invalid type. Must be one of: bug, improvement, other' },
				400
			);
		}

		// NVC 4 steps: observation, feelings, needs, request
		const hasNvcSteps =
			[observation, feelings, needs, request].some(
				(v) => typeof v === 'string' && v.trim().length > 0
			);
		const hasLegacy = typeof title === 'string' && title.trim().length > 0
			&& typeof message === 'string' && message.trim().length > 0;

		if (!hasNvcSteps && !hasLegacy) {
			return c.json(
				{ error: 'Bitte fülle die 4 Schritte der Gewaltfreien Kommunikation aus oder gib Titel und Nachricht ein.' },
				400
			);
		}

		const trim = (s: unknown, max: number) =>
			typeof s === 'string' ? s.trim().slice(0, max) : null;
		const id = crypto.randomUUID();
		await db.insert(userFeedback).values({
			id,
			userId: authUser.id,
			type: type as (typeof FEEDBACK_TYPES)[number],
			title: trim(title, 500) ?? (trim(observation, 100) || 'Feedback'),
			message: trim(message, 10000) ?? [observation, feelings, needs, request]
				.filter(Boolean)
				.join('\n\n'),
			observation: trim(observation, 5000),
			feelings: trim(feelings, 5000),
			needs: trim(needs, 5000),
			request: trim(request, 5000),
			metadata: metadata ? JSON.stringify(metadata) : null,
		});

		return c.json({
			success: true,
			message: 'Vielen Dank für dein Feedback!',
			id,
		});
	} catch (error) {
		console.error('Error submitting feedback:', error);
		return c.json({ error: 'Failed to submit feedback' }, 500);
	}
});

// GET /api/feedback - List current user's feedback (optional, for "my submissions")
feedback.get('/', async (c: Context) => {
	const authUser = c.get('user');
	if (!authUser) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const list = await db
			.select({
				id: userFeedback.id,
				type: userFeedback.type,
				title: userFeedback.title,
				created: userFeedback.created,
			})
			.from(userFeedback)
			.where(eq(userFeedback.userId, authUser.id))
			.orderBy(desc(userFeedback.created));

		return c.json({ feedback: list });
	} catch (error) {
		console.error('Error listing feedback:', error);
		return c.json({ error: 'Failed to list feedback' }, 500);
	}
});

export default feedback;
