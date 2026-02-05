import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql, gte } from 'drizzle-orm';
import { user as userTable, session, chats } from '../../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);
const analytics = new Hono();

// GET /api/analytics - Admin-only analytics (total users, logins/day, chats/day)
analytics.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Fetch role from DB - try by id first, then by email (session user may have different id format)
	let dbResult = await db
		.select({ role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, user.id))
		.limit(1);

	if (dbResult.length === 0 && user.email) {
		dbResult = await db
			.select({ role: userTable.role, email: userTable.email })
			.from(userTable)
			.where(eq(userTable.email, user.email))
			.limit(1);
	}

	const dbUser = dbResult[0];
	const roleVal = dbUser?.role != null ? String(dbUser.role).trim().toLowerCase() : '';
	const sessionRole = (user as any)?.role != null ? String((user as any).role).trim().toLowerCase() : '';
	const isAdmin =
		roleVal === 'admin' ||
		sessionRole === 'admin' ||
		(dbUser?.email != null && String(dbUser.email).toLowerCase().endsWith('@admin.com')) ||
		(user?.email != null && String(user.email).toLowerCase().endsWith('@admin.com'));

	if (!isAdmin) {
		return c.json({ error: 'Forbidden: admin role required' }, 403);
	}

	try {
		const daysParam = c.req.query('days');
		const days = Math.min(Math.max(parseInt(daysParam || '30', 10), 7), 90);

		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);
		startDate.setHours(0, 0, 0, 0);
		const startIso = startDate.toISOString();

		// Total users
		const [totalUsersResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(userTable);

		const totalUsers = totalUsersResult?.count ?? 0;

		// Logins per day (sessions created per day)
		const loginsPerDayRaw = await db
			.select({
				date: sql<string>`date(${session.createdAt})`,
				count: sql<number>`count(*)::int`
			})
			.from(session)
			.where(gte(session.createdAt, startIso))
			.groupBy(sql`date(${session.createdAt})`)
			.orderBy(sql`date(${session.createdAt})`);

		const loginsPerDay = loginsPerDayRaw.map((r) => ({
			date: r.date,
			count: r.count
		}));

		// Chats per day
		const chatsPerDayRaw = await db
			.select({
				date: sql<string>`date(${chats.created})`,
				count: sql<number>`count(*)::int`
			})
			.from(chats)
			.where(gte(chats.created, startIso))
			.groupBy(sql`date(${chats.created})`)
			.orderBy(sql`date(${chats.created})`);

		const chatsPerDay = chatsPerDayRaw.map((r) => ({
			date: r.date,
			count: r.count
		}));

		// Total chats
		const [totalChatsResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(chats);

		const totalChats = totalChatsResult?.count ?? 0;

		return c.json({
			totalUsers,
			totalChats,
			loginsPerDay,
			chatsPerDay,
			days
		});
	} catch (error) {
		console.error('Error fetching analytics:', error);
		return c.json({ error: 'Failed to fetch analytics' }, 500);
	}
});

export default analytics;
