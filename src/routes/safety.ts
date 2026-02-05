import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, gte } from 'drizzle-orm';
import { crisisResources, userSafetyFlags, user as userTable } from '../../drizzle/schema.js';
import {
	getFlagSummary,
	getSafetyLevel,
	requestAppeal,
	reviewAppeal,
	SAFETY_LIMITS,
} from '../lib/safety.js';

const db = drizzle(process.env.DATABASE_URL!);

const safety = new Hono();

// GET /api/safety/status - Get current user's safety status (for frontend)
safety.get('/status', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const level = await getSafetyLevel(user.id);

	const limits =
		level === 2
			? SAFETY_LIMITS.level2
			: level === 3
				? SAFETY_LIMITS.level3
				: null;

	return c.json({
		level,
		suspended: level >= 4,
		showResources: level >= 2,
		limits,
	});
});

// GET /api/safety/resources - Get crisis resources (public, for flagged users)
safety.get('/resources', async (c: Context) => {
	const lang = (c.req.query('lang') || 'de').slice(0, 2);

	const resources = await db
		.select()
		.from(crisisResources)
		.where(eq(crisisResources.language, lang))
		.orderBy(crisisResources.sortOrder);

	if (resources.length === 0) {
		return c.json({
			resources: [
				{
					name: 'Telefonseelsorge',
					description: 'Kostenlose Beratung bei Krisen',
					phone: '0800 111 0 111 / 0800 111 0 222',
					url: 'https://online.telefonseelsorge.de',
				},
				{
					name: 'Find a Helpline',
					description: 'International crisis support',
					url: 'https://findahelpline.com',
				},
			],
		});
	}

	return c.json({
		resources: resources
			.filter((r) => r.isActive)
			.map((r) => ({
				name: r.name,
				description: r.description,
				phone: r.phone,
				url: r.url,
			})),
	});
});

// POST /api/safety/appeal - Request appeal (user)
safety.post('/appeal', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const result = await requestAppeal(user.id);
	return c.json(result);
});

// GET /api/safety/admin/list - List flagged users (admin only, metadata only - no chat content)
safety.get('/admin/list', async (c: Context) => {
	const user = c.get('user');
	if (!user) return c.json({ error: 'Unauthorized' }, 401);

	const [u] = await db
		.select({ role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, user.id))
		.limit(1);

	const isAdmin =
		u?.role?.toLowerCase() === 'admin' ||
		user?.email?.toLowerCase().endsWith('@admin.com');
	if (!isAdmin) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	const flags = await db
		.select({
			userId: userSafetyFlags.userId,
			level: userSafetyFlags.level,
			reason: userSafetyFlags.reason,
			detectedAt: userSafetyFlags.detectedAt,
			expiresAt: userSafetyFlags.expiresAt,
			appealRequestedAt: userSafetyFlags.appealRequestedAt,
			appealStatus: userSafetyFlags.appealStatus,
			appealReviewedAt: userSafetyFlags.appealReviewedAt,
			appealReviewedBy: userSafetyFlags.appealReviewedBy,
		})
		.from(userSafetyFlags)
		.where(gte(userSafetyFlags.level, 1));

	// Add summary for each flagged user (why they were flagged)
	const flaggedWithSummary = await Promise.all(
		flags.map(async (f) => ({
			...f,
			summary: await getFlagSummary(f.userId),
		}))
	);

	return c.json({ flagged: flaggedWithSummary });
});

// POST /api/safety/admin/review-appeal - Approve or deny appeal (admin only)
safety.post('/admin/review-appeal', async (c: Context) => {
	const adminUser = c.get('user');
	if (!adminUser) return c.json({ error: 'Unauthorized' }, 401);

	const [u] = await db
		.select({ role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, adminUser.id))
		.limit(1);

	const isAdmin =
		u?.role?.toLowerCase() === 'admin' ||
		adminUser?.email?.toLowerCase().endsWith('@admin.com');
	if (!isAdmin) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	const body = await c.req.json();
	const { userId, approved } = body as { userId: string; approved: boolean };

	if (!userId || typeof approved !== 'boolean') {
		return c.json({ error: 'userId and approved (boolean) required' }, 400);
	}

	const result = await reviewAppeal(userId, approved, adminUser.id);
	return c.json(result);
});

export default safety;
