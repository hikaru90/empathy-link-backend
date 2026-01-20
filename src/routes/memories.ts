/**
 * Memory API routes
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
	searchSimilarMemories,
	createMemory,
	getUserMemories,
	deleteMemory,
	deleteMemories,
	formatMemoriesForPrompt
} from '../lib/memory.js';
import type { Env } from '../types/hono.js';

const app = new Hono<Env>();

/**
 * Search for similar memories
 * POST /api/memories/search
 * Body: { query: string, limit?: number }
 */
app.post('/search', async (c: Context<Env>) => {
	try {
		const user = c.get('user');
		if (!user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const { query, limit = 5 } = await c.req.json();

		if (!query) {
			return c.json({ error: 'Query is required' }, 400);
		}

		const memories = await searchSimilarMemories(query, user.id, limit);

		return c.json({
			memories,
			count: memories.length,
			formattedContext: formatMemoriesForPrompt(memories)
		});
	} catch (error) {
		console.error('Error searching memories:', error);
		return c.json({ error: 'Failed to search memories' }, 500);
	}
});

/**
 * Create a new memory
 * POST /api/memories
 * Body: { summary: string, chatId?: string, confidence?: string }
 */
app.post('/', async (c: Context<Env>) => {
	try {
		const user = c.get('user');
		if (!user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const { summary, chatId, confidence = 'medium' } = await c.req.json();

		if (!summary) {
			return c.json({ error: 'Summary is required' }, 400);
		}

		const memory = await createMemory(user.id, summary, chatId, confidence);

		return c.json({
			success: true,
			memory
		});
	} catch (error) {
		console.error('Error creating memory:', error);
		return c.json({ error: 'Failed to create memory' }, 500);
	}
});

/**
 * Get all memories for the current user
 * GET /api/memories
 * Query params: limit (default: 50)
 */
app.get('/', async (c: Context<Env>) => {
	try {
		const user = c.get('user');
		if (!user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const limit = parseInt(c.req.query('limit') || '50');
		const memories = await getUserMemories(user.id, limit);

		return c.json({
			memories,
			count: memories.length
		});
	} catch (error) {
		console.error('Error getting memories:', error);
		return c.json({ error: 'Failed to get memories' }, 500);
	}
});

/**
 * Delete multiple memories
 * DELETE /api/memories/bulk
 * Body: { ids: string[] }
 */
app.delete('/bulk', async (c: Context<Env>) => {
	try {
		const user = c.get('user');
		if (!user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const { ids } = await c.req.json();

		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: 'ids array is required' }, 400);
		}

		const success = await deleteMemories(ids, user.id);

		if (!success) {
			return c.json({ error: 'Failed to delete memories' }, 500);
		}

		return c.json({ success: true, deletedCount: ids.length });
	} catch (error) {
		console.error('Error deleting memories:', error);
		return c.json({ error: 'Failed to delete memories' }, 500);
	}
});

/**
 * Delete a memory
 * DELETE /api/memories/:id
 */
app.delete('/:id', async (c: Context<Env>) => {
	try {
		const user = c.get('user');
		if (!user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const memoryId = c.req.param('id');
		const success = await deleteMemory(memoryId, user.id);

		if (!success) {
			return c.json({ error: 'Failed to delete memory' }, 500);
		}

		return c.json({ success: true });
	} catch (error) {
		console.error('Error deleting memory:', error);
		return c.json({ error: 'Failed to delete memory' }, 500);
	}
});

export default app;
