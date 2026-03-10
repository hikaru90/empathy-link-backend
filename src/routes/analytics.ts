import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { tokenUsage, session, chats, user as userTable } from '../../drizzle/schema.js';
import { sql, desc, sum, eq, and, gte, isNotNull } from 'drizzle-orm';
import type { Env } from '../types/hono.js';
import { getUserTokenUsageToday, getTokenLimitForRole } from '../lib/token-usage.js';

const analytics = new Hono<Env>();

// GET /api/analytics - Dashboard analytics (active users, new signups, retention, trend)
analytics.get('/', async (c) => {
	const daysParam = c.req.query('days');
	const days = Math.min(90, Math.max(1, parseInt(daysParam || '30', 10) || 30));

	const now = new Date();
	const periodEnd = new Date(now);
	periodEnd.setUTCHours(23, 59, 59, 999);
	const periodStart = new Date(now);
	periodStart.setUTCDate(periodStart.getUTCDate() - days);
	periodStart.setUTCHours(0, 0, 0, 0);
	const prevPeriodEnd = new Date(periodStart);
	prevPeriodEnd.setUTCMilliseconds(-1);
	const prevPeriodStart = new Date(periodStart);
	prevPeriodStart.setUTCDate(prevPeriodStart.getUTCDate() - days);

	const periodStartIso = periodStart.toISOString();
	const periodEndIso = periodEnd.toISOString();
	const prevPeriodStartIso = prevPeriodStart.toISOString();
	const prevPeriodEndIso = prevPeriodEnd.toISOString();

	try {
		// Active in current period (distinct users with session or chat)
		const activeResult = await db.execute(sql`
			SELECT COUNT(DISTINCT uid)::int AS c FROM (
				SELECT user_id AS uid FROM session WHERE created_at >= ${periodStartIso} AND created_at <= ${periodEndIso}
				UNION
				SELECT user_id AS uid FROM chats WHERE created >= ${periodStartIso} AND created <= ${periodEndIso}
			) u
		`);
		const activeRows = Array.isArray(activeResult) ? activeResult : (activeResult as { rows?: { c?: number }[] }).rows ?? [];
		const activeInPeriod = Number(activeRows[0]?.c ?? 0);

		// Active in previous period (for trend)
		const activePrevResult = await db.execute(sql`
			SELECT COUNT(DISTINCT uid)::int AS c FROM (
				SELECT user_id AS uid FROM session WHERE created_at >= ${prevPeriodStartIso} AND created_at <= ${prevPeriodEndIso}
				UNION
				SELECT user_id AS uid FROM chats WHERE created >= ${prevPeriodStartIso} AND created <= ${prevPeriodEndIso}
			) u
		`);
		const activePrevRows = Array.isArray(activePrevResult) ? activePrevResult : (activePrevResult as { rows?: { c?: number }[] }).rows ?? [];
		const activeInPrevPeriod = Number(activePrevRows[0]?.c ?? 0);

		// Active users per day (for trend chart)
		const activePerDayResult = await db.execute(sql`
			SELECT d::date::text AS date, COALESCE(COUNT(DISTINCT uid), 0)::int AS count
			FROM generate_series(${periodStartIso}::date, ${periodEndIso}::date, '1 day'::interval) d
			LEFT JOIN (
				SELECT date_trunc('day', created_at)::date AS day, user_id AS uid FROM session WHERE created_at >= ${periodStartIso} AND created_at <= ${periodEndIso}
				UNION
				SELECT date_trunc('day', created)::date AS day, user_id AS uid FROM chats WHERE created >= ${periodStartIso} AND created <= ${periodEndIso}
			) u ON d::date = u.day
			GROUP BY d::date
			ORDER BY d::date
		`);
		const activePerDayRows = Array.isArray(activePerDayResult)
			? activePerDayResult
			: ((activePerDayResult as unknown as { rows?: { date: string; count: number }[] }).rows ?? []);
		const activeUsersPerDay = (activePerDayRows as { date: string; count: number }[]).map((r) => ({
			date: r.date?.slice(0, 10) ?? '',
			count: Number(r.count ?? 0)
		}));

		// New signups in period
		const signupsResult = await db.execute(sql`
			SELECT COUNT(*)::int AS c FROM "user" WHERE created_at >= ${periodStartIso} AND created_at <= ${periodEndIso}
		`);
		const signupsRows = Array.isArray(signupsResult) ? signupsResult : (signupsResult as { rows?: { c?: number }[] }).rows ?? [];
		const newSignupsInPeriod = Number(signupsRows[0]?.c ?? 0);

		// Signups per day (for trend chart)
		const signupsPerDayResult = await db.execute(sql`
			SELECT d::date::text AS date, COALESCE(COUNT(u.id), 0)::int AS count
			FROM generate_series(${periodStartIso}::date, ${periodEndIso}::date, '1 day'::interval) d
			LEFT JOIN "user" u ON date_trunc('day', u.created_at)::date = d::date AND u.created_at >= ${periodStartIso} AND u.created_at <= ${periodEndIso}
			GROUP BY d::date
			ORDER BY d::date
		`);
		const signupsPerDayRows = Array.isArray(signupsPerDayResult)
			? signupsPerDayResult
			: ((signupsPerDayResult as unknown as { rows?: { date: string; count: number }[] }).rows ?? []);
		const signupsPerDay = (signupsPerDayRows as { date: string; count: number }[]).map((r) => ({
			date: r.date?.slice(0, 10) ?? '',
			count: Number(r.count ?? 0)
		}));

		// Chats in period
		const chatsResult = await db.execute(sql`
			SELECT COUNT(*)::int AS c FROM chats WHERE created >= ${periodStartIso} AND created <= ${periodEndIso}
		`);
		const chatsRows = Array.isArray(chatsResult) ? chatsResult : (chatsResult as { rows?: { c?: number }[] }).rows ?? [];
		const chatsInPeriod = Number(chatsRows[0]?.c ?? 0);

		// Chats in previous period (for trend)
		const chatsPrevResult = await db.execute(sql`
			SELECT COUNT(*)::int AS c FROM chats WHERE created >= ${prevPeriodStartIso} AND created <= ${prevPeriodEndIso}
		`);
		const chatsPrevRows = Array.isArray(chatsPrevResult) ? chatsPrevResult : (chatsPrevResult as { rows?: { c?: number }[] }).rows ?? [];
		const chatsInPrevPeriod = Number(chatsPrevRows[0]?.c ?? 0);

		// Chats per day (for trend chart)
		const chatsPerDayResult = await db.execute(sql`
			SELECT d::date::text AS date, COALESCE(COUNT(c.id), 0)::int AS count
			FROM generate_series(${periodStartIso}::date, ${periodEndIso}::date, '1 day'::interval) d
			LEFT JOIN chats c ON date_trunc('day', c.created)::date = d::date AND c.created >= ${periodStartIso} AND c.created <= ${periodEndIso}
			GROUP BY d::date
			ORDER BY d::date
		`);
		const chatsPerDayRows = Array.isArray(chatsPerDayResult)
			? chatsPerDayResult
			: ((chatsPerDayResult as unknown as { rows?: { date: string; count: number }[] }).rows ?? []);
		const chatsPerDay = (chatsPerDayRows as { date: string; count: number }[]).map((r) => ({
			date: r.date?.slice(0, 10) ?? '',
			count: Number(r.count ?? 0)
		}));

		// Retention: users active in prev period who were also active in current period
		const retentionResult = await db.execute(sql`
			WITH prev_active AS (
				SELECT user_id AS uid FROM session WHERE created_at >= ${prevPeriodStartIso} AND created_at <= ${prevPeriodEndIso}
				UNION
				SELECT user_id AS uid FROM chats WHERE created >= ${prevPeriodStartIso} AND created <= ${prevPeriodEndIso}
			),
			curr_active AS (
				SELECT user_id AS uid FROM session WHERE created_at >= ${periodStartIso} AND created_at <= ${periodEndIso}
				UNION
				SELECT user_id AS uid FROM chats WHERE created >= ${periodStartIso} AND created <= ${periodEndIso}
			),
			retained AS (
				SELECT p.uid FROM prev_active p INNER JOIN curr_active c ON p.uid = c.uid
			),
			prev_count AS (SELECT COUNT(*)::int AS c FROM prev_active),
			retained_count AS (SELECT COUNT(*)::int AS c FROM retained)
			SELECT (SELECT c FROM prev_count) AS prev_count, (SELECT c FROM retained_count) AS retained_count
		`);
		const retRows = Array.isArray(retentionResult) ? retentionResult : (retentionResult as { rows?: { prev_count?: number; retained_count?: number }[] }).rows ?? [];
		const prevCount = Number(retRows[0]?.prev_count ?? 0);
		const retainedCount = Number(retRows[0]?.retained_count ?? 0);
		const retentionPct = prevCount > 0 ? Math.round((retainedCount / prevCount) * 100) : 0;

		// Returning users per day (users active on that day who were also active in prev period) for retention trend
		const retentionPerDayResult = await db.execute(sql`
			WITH prev_active AS (
				SELECT user_id AS uid FROM session WHERE created_at >= ${prevPeriodStartIso} AND created_at <= ${prevPeriodEndIso}
				UNION
				SELECT user_id AS uid FROM chats WHERE created >= ${prevPeriodStartIso} AND created <= ${prevPeriodEndIso}
			),
			curr_per_day AS (
				SELECT date_trunc('day', created_at)::date AS day, user_id AS uid FROM session WHERE created_at >= ${periodStartIso} AND created_at <= ${periodEndIso}
				UNION
				SELECT date_trunc('day', created)::date AS day, user_id AS uid FROM chats WHERE created >= ${periodStartIso} AND created <= ${periodEndIso}
			)
			SELECT d::date::text AS date, COALESCE(COUNT(DISTINCT ret.uid), 0)::int AS count
			FROM generate_series(${periodStartIso}::date, ${periodEndIso}::date, '1 day'::interval) d
			LEFT JOIN (
				SELECT c.day, c.uid FROM curr_per_day c
				INNER JOIN prev_active p ON p.uid = c.uid
			) ret ON ret.day = d::date
			GROUP BY d::date
			ORDER BY d::date
		`);
		const retentionPerDayRows = Array.isArray(retentionPerDayResult)
			? retentionPerDayResult
			: ((retentionPerDayResult as unknown as { rows?: { date: string; count: number }[] }).rows ?? []);
		const retentionPerDay = (retentionPerDayRows as { date: string; count: number }[]).map((r) => ({
			date: r.date?.slice(0, 10) ?? '',
			count: Number(r.count ?? 0)
		}));

		return c.json({
			days,
			activeInPeriod,
			activeInPrevPeriod,
			activeUsersPerDay,
			newSignupsInPeriod,
			signupsPerDay,
			chatsInPeriod,
			chatsInPrevPeriod,
			chatsPerDay,
			retentionPct,
			retentionCount: retainedCount,
			retentionDenom: prevCount,
			retentionPerDay
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error fetching dashboard analytics:', error);
		return c.json({ error: 'Failed to fetch analytics', detail: message }, 500);
	}
});

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

		// Include today's usage and daily limit (role-based)
		const [usedToday, limit] = await Promise.all([
			getUserTokenUsageToday(targetUserId),
			db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, targetUserId)).limit(1).then((r) => getTokenLimitForRole(r[0]?.role ?? 'user')),
		]);

		return c.json({ usage, today: { usedToday, limit } });
	} catch (error) {
		console.error('Error fetching user token usage:', error);
		return c.json({ error: 'Failed to fetch user usage' }, 500);
	}
});

// GET /api/analytics/token-usage/by-user - Token usage per user with role and daily limit (admin only)
analytics.get('/token-usage/by-user', async (c) => {
	const user = c.get('user');
	if (!user || user.role !== 'admin') {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const { period } = c.req.query();
	const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setUTCHours(0, 0, 0, 0);
	const startIso = startDate.toISOString();

	// Start of today UTC for "used today" subquery
	const todayStart = new Date();
	todayStart.setUTCHours(0, 0, 0, 0);
	const todayIso = todayStart.toISOString();

	try {
		const raw = await db.execute(sql`
			SELECT
				t.user_id AS "userId",
				u.name,
				u.email,
				COALESCE(u.role, 'user') AS role,
				COALESCE(rs.daily_token_limit, 100000) AS "dailyTokenLimit",
				(SELECT COALESCE(SUM(t2.total_tokens), 0)::int FROM token_usage t2 WHERE t2.user_id = t.user_id AND t2.created >= ${todayIso}) AS "usedToday",
				SUM(t.total_tokens)::bigint AS "totalTokens",
				SUM(t.cost)::double precision AS "totalCost",
				COUNT(*)::int AS count
			FROM token_usage t
			INNER JOIN "user" u ON u.id = t.user_id
			LEFT JOIN role_settings rs ON rs.role = COALESCE(u.role, 'user')
			WHERE t.created >= ${startIso} AND t.user_id IS NOT NULL
			GROUP BY t.user_id, u.name, u.email, u.role, rs.daily_token_limit
			ORDER BY SUM(t.total_tokens) DESC
		`);

		const rows = Array.isArray(raw) ? raw : (raw as { rows?: Record<string, unknown>[] }).rows ?? [];
		const byUserList = (rows as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
			userId: row.userId,
			name: row.name ?? '',
			email: row.email ?? '',
			role: (row.role as string) ?? 'user',
			dailyTokenLimit: Number(row.dailyTokenLimit ?? 100_000),
			usedToday: Number(row.usedToday ?? 0),
			totalTokens: Number(row.totalTokens ?? 0),
			totalCost: Number(row.totalCost ?? 0),
			count: Number(row.count ?? 0)
		}));

		return c.json({ period: period || '30d', byUser: byUserList });
	} catch (error) {
		console.error('Error fetching token usage by user:', error);
		return c.json({ error: 'Failed to fetch token usage by user' }, 500);
	}
});

export default analytics;
