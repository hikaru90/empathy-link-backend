import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc, and, or, lte, sql, count } from 'drizzle-orm';
import { messages as messagesTable } from '../../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);
const messages = new Hono();

// GET /api/messages - Get messages
messages.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const page = parseInt(c.req.query('page') || '1');
		const perPage = parseInt(c.req.query('perPage') || '20');
		const type = c.req.query('type');
		const unreadOnly = c.req.query('unread') === 'true';

		// Build filter: messages for this user OR public announcements that have been sent
		const now = new Date().toISOString();
		let baseFilter = or(
			eq(messagesTable.userId, user.id),
			and(
				eq(messagesTable.type, 'public_announcement'),
				or(
					lte(messagesTable.sentAt, now),
					sql`${messagesTable.sentAt} IS NULL`
				)
			)
		);

		// Apply additional filters
		const filters = [baseFilter];
		if (type) {
			filters.push(eq(messagesTable.type, type));
		}
		if (unreadOnly) {
			filters.push(eq(messagesTable.read, false));
		}

		// Fetch messages with pagination
		const messagesResult = await db
			.select()
			.from(messagesTable)
			.where(and(...filters))
			.orderBy(desc(messagesTable.created))
			.limit(perPage)
			.offset((page - 1) * perPage);

		// Count total messages for pagination
		const totalCountResult = await db
			.select({ count: count() })
			.from(messagesTable)
			.where(and(...filters));

		const totalCount = totalCountResult[0]?.count || 0;
		const totalPages = Math.ceil(Number(totalCount) / perPage);

		// Count unread messages
		const unreadCountResult = await db
			.select({ count: count() })
			.from(messagesTable)
			.where(and(baseFilter, eq(messagesTable.read, false)));

		const unreadCount = unreadCountResult[0]?.count || 0;

		return c.json({
			messages: messagesResult,
			totalPages,
			currentPage: page,
			unreadCount: Number(unreadCount)
		});
	} catch (error) {
		console.error('Error fetching messages:', error);
		return c.json({ error: 'Failed to fetch messages' }, 500);
	}
});

// POST /api/messages - Create a message
messages.post('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	let messageData: any;
	try {
		const { title, content, type, scheduledFor, priority, reminderData } = await c.req.json();

		if (!title || !content || !type) {
			return c.json({ error: 'Title, content and type are required' }, 400);
		}

		// Prepare the message data
		messageData = {
			id: crypto.randomUUID(),
			type,
			title,
			content,
			read: false,
			priority: priority || 1,
			fromUserId: user.id
		};

		// Add userId only if not a public announcement
		if (type !== 'public_announcement') {
			messageData.userId = user.id;
		}

		// Handle scheduling
		if (scheduledFor) {
			messageData.scheduledFor = scheduledFor;
			messageData.sentAt = null;
		} else {
			messageData.sentAt = new Date().toISOString();
			messageData.scheduledFor = null;
		}

		// Add reminder data if present
		if (reminderData) {
			messageData.reminderData = JSON.stringify(reminderData);
		}

		console.log('Creating message with data:', messageData);

		const message = await db.insert(messagesTable).values(messageData).returning();

		return c.json({ message: message[0] });
	} catch (error: any) {
		console.error('Error creating message:', error);
		console.error('Message data that failed:', messageData);

		const errorMessage = error?.message || 'Failed to create message';

		return c.json({
			error: errorMessage,
			sentData: messageData
		}, 500);
	}
});

// GET /api/messages/:id - Get a specific message
messages.get('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');

		const message = await db.select().from(messagesTable)
			.where(and(
				eq(messagesTable.id, id),
				or(
					eq(messagesTable.userId, user.id),
					eq(messagesTable.type, 'public_announcement')
				)
			))
			.limit(1);

		if (!message || message.length === 0) {
			return c.json({ error: 'Message not found' }, 404);
		}

		return c.json({ message: message[0] });
	} catch (error) {
		console.error('Error fetching message:', error);
		return c.json({ error: 'Message not found' }, 404);
	}
});

// PATCH /api/messages/:id - Update a message (mark as read)
messages.patch('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');
		const updates = await c.req.json();

		// Verify the message belongs to the user or is a public announcement
		const message = await db.select().from(messagesTable)
			.where(and(
				eq(messagesTable.id, id),
				or(
					eq(messagesTable.userId, user.id),
					eq(messagesTable.type, 'public_announcement')
				)
			))
			.limit(1);

		if (!message || message.length === 0) {
			return c.json({ error: 'Message not found' }, 404);
		}

		// For public announcements, we can't update the shared message
		// In the future, this should use a read receipts table
		if (message[0].type === 'public_announcement') {
			console.log('Public announcement read status update - not persisting to DB');
			return c.json({ message: { ...message[0], read: true } });
		}

		// Only allow updating read status for now
		const allowedUpdates = {
			read: updates.read,
			updated: new Date().toISOString()
		};

		const updatedMessage = await db.update(messagesTable)
			.set(allowedUpdates)
			.where(eq(messagesTable.id, id))
			.returning();

		return c.json({ message: updatedMessage[0] });
	} catch (error) {
		console.error('Error updating message:', error);
		return c.json({ error: 'Failed to update message' }, 500);
	}
});

// DELETE /api/messages/:id - Delete a message
messages.delete('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');

		// Verify the message belongs to the user (can't delete public announcements)
		const message = await db.select().from(messagesTable)
			.where(and(
				eq(messagesTable.id, id),
				eq(messagesTable.userId, user.id)
			))
			.limit(1);

		if (!message || message.length === 0) {
			return c.json({ error: 'Message not found or cannot be deleted' }, 404);
		}

		await db.delete(messagesTable).where(eq(messagesTable.id, id));

		return c.json({ success: true });
	} catch (error) {
		console.error('Error deleting message:', error);
		return c.json({ error: 'Failed to delete message' }, 500);
	}
});

// POST /api/messages/process-scheduled - Process scheduled messages
messages.post('/process-scheduled', async (c: Context) => {
	try {
		const { authKey } = await c.req.json();

		// Basic auth check
		if (authKey !== process.env.SCHEDULED_TASK_AUTH_KEY) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const now = new Date().toISOString();

		// Find scheduled messages that are ready to be sent
		const scheduledMessages = await db.select().from(messagesTable)
			.where(and(
				sql`${messagesTable.scheduledFor} IS NOT NULL`,
				lte(messagesTable.scheduledFor, now),
				sql`${messagesTable.sentAt} IS NULL`
			))
			.limit(100);

		const processedMessages: any[] = [];

		// Process messages
		for (const message of scheduledMessages) {
			try {
				await db.update(messagesTable)
					.set({ sentAt: now, updated: now })
					.where(eq(messagesTable.id, message.id));

				processedMessages.push({
					id: message.id,
					title: message.title,
					type: message.type,
					status: 'sent'
				});
			} catch (error: any) {
				processedMessages.push({
					id: message.id,
					title: message.title,
					type: message.type,
					status: 'error',
					error: error.message
				});
			}
		}

		// TODO: Process due reminders (requires reminders table queries)

		return c.json({
			processedMessages,
			processedReminders: [],
			summary: {
				messagesProcessed: processedMessages.length,
				remindersProcessed: 0,
				messagesSuccess: processedMessages.filter(m => m.status === 'sent').length,
				remindersSuccess: 0
			}
		});
	} catch (error) {
		console.error('Error processing scheduled messages:', error);
		return c.json({ error: 'Failed to process scheduled messages' }, 500);
	}
});

export default messages;
