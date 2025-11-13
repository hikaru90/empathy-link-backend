import { Hono } from 'hono';
import type { Context } from 'hono';

const reminders = new Hono();

// GET /api/reminders - Get reminders
reminders.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const page = parseInt(c.req.query('page') || '1');
		const perPage = parseInt(c.req.query('perPage') || '20');
		const activeOnly = c.req.query('active') !== 'false';

		// TODO: Build filter and query database
		// let query = db.select().from(remindersTable)
		//   .where(eq(remindersTable.userId, user.id));
		//
		// if (activeOnly) {
		//   query = query.where(eq(remindersTable.active, true));
		// }
		//
		// const remindersResult = await query
		//   .orderBy(asc(remindersTable.scheduledFor))
		//   .limit(perPage)
		//   .offset((page - 1) * perPage);
		//
		// const totalCount = await db.select({ count: count() })
		//   .from(remindersTable)
		//   .where(eq(remindersTable.userId, user.id));

		return c.json({
			reminders: [], // TODO: Use remindersResult
			totalPages: 0, // TODO: Calculate from totalCount
			currentPage: page
		});
	} catch (error) {
		console.error('Error fetching reminders:', error);
		return c.json({ error: 'Failed to fetch reminders' }, 500);
	}
});

// POST /api/reminders - Create a reminder
reminders.post('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { title, message, scheduledFor, recurring, recurringData } = await c.req.json();

		if (!title || !message || !scheduledFor) {
			return c.json({ error: 'Title, message and scheduledFor are required' }, 400);
		}

		const reminderData = {
			userId: user.id,
			title,
			message,
			scheduledFor,
			recurring: recurring || '',
			recurringData: recurringData ? JSON.stringify(recurringData) : '',
			active: true,
			lastSent: ''
		};

		// TODO: Create reminder in database
		// const reminder = await db.insert(remindersTable)
		//   .values(reminderData)
		//   .returning();

		return c.json({ reminder: reminderData }); // TODO: Use reminder[0]
	} catch (error) {
		console.error('Error creating reminder:', error);
		return c.json({ error: 'Failed to create reminder' }, 500);
	}
});

export default reminders;
