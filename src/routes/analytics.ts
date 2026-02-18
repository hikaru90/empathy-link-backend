import { Hono } from 'hono';
import { db } from '../lib/db';
import { tokenUsage } from '../../drizzle/schema';
import { sql, desc, sum, eq, and, gte, lte } from 'drizzle-orm';
import type { Context } from '../types/hono';

const analytics = new Hono<Context>();

// GET /api/analytics/token-usage - Get aggregated token usage stats
analytics.get('/token-usage', async (c) => {
	const user = c.get('user');
	// In a real app, you might restrict this to admins
	// if (!user || user.role !== 'admin') return c.json({ error: 'Unauthorized' }, 401);

	const { period, userId, applicationId } = c.req.query();
	
	// Default to last 30 days
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - (period === '7d' ? 7 : period === '90d' ? 90 : 30));

	const conditions = [
		gte(tokenUsage.created, startDate.toISOString())
	];

	if (userId) conditions.push(eq(tokenUsage.userId, userId));
	if (applicationId) conditions.push(eq(tokenUsage.application, applicationId));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	try {
		// Aggregate by context
		const byContext = await db
			.select({
				context: tokenUsage.context,
				totalTokens: sum(tokenUsage.totalTokens),
				totalCost: sum(tokenUsage.cost),
				count: sql<number>`count(*)`
			})
			.from(tokenUsage)
			.where(whereClause)
			.groupBy(tokenUsage.context)
			.orderBy(desc(sum(tokenUsage.totalTokens)));

		// Aggregate by model
		const byModel = await db
			.select({
				model: tokenUsage.model,
				totalTokens: sum(tokenUsage.totalTokens),
				totalCost: sum(tokenUsage.cost),
				count: sql<number>`count(*)`
			})
			.from(tokenUsage)
			.where(whereClause)
			.groupBy(tokenUsage.model)
			.orderBy(desc(sum(tokenUsage.totalTokens)));
			
		// Total stats
		const total = await db
			.select({
				totalTokens: sum(tokenUsage.totalTokens),
				totalCost: sum(tokenUsage.cost),
				count: sql<number>`count(*)`
			})
			.from(tokenUsage)
			.where(whereClause);

		return c.json({
			period: period || '30d',
			totals: total[0],
			breakdown: {
				byContext,
				byModel
			}
		});
	} catch (error) {
		console.error('Error fetching token analytics:', error);
		return c.json({ error: 'Failed to fetch analytics' }, 500);
	}
});

// GET /api/analytics/token-usage/user/:userId - Get specific user usage
analytics.get('/token-usage/user/:userId', async (c) => {
	const targetUserId = c.req.param('userId');
	const user = c.get('user');
	
	// Allow users to see their own usage, or admins to see anyone's
	if (!user || (user.id !== targetUserId && user.role !== 'admin')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const usage = await db
			.select({
				date: sql<string>`date_trunc('day', ${tokenUsage.created})::text`,
				totalTokens: sum(tokenUsage.totalTokens),
				cost: sum(tokenUsage.cost)
			})
			.from(tokenUsage)
			.where(eq(tokenUsage.userId, targetUserId))
			.groupBy(sql`date_trunc('day', ${tokenUsage.created})`)
			.orderBy(desc(sql`date_trunc('day', ${tokenUsage.created})`))
			.limit(30);

		return c.json({ usage });
	} catch (error) {
		console.error('Error fetching user token usage:', error);
		return c.json({ error: 'Failed to fetch user usage' }, 500);
	}
});

export default analytics;
