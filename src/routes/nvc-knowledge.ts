import { Hono } from 'hono';
import type { Context } from 'hono';
import {
	createNVCKnowledgeEntry,
	updateNVCKnowledgeEntry,
	getNVCKnowledgeEntry,
	deleteNVCKnowledgeEntry,
	searchNVCKnowledge,
	findSimilarNVCKnowledge,
	getNVCKnowledgeTranslations,
	listNVCKnowledge,
	getNVCCategories,
	getNVCTags,
	type CreateNVCKnowledgeInput,
	type SearchOptions
} from '../lib/nvc-knowledge.js';
import { retrieveNVCKnowledge } from '../lib/ai-tools.js';

const nvcKnowledge = new Hono();

// Helper to check if user is admin (you may need to adjust this based on your auth setup)
function isAdmin(user: any): boolean {
	// Adjust this based on your user model
	return user?.role === 'admin' || user?.email?.endsWith('@admin.com');
}

// GET /api/nvc-knowledge - List all entries (with filters)
nvcKnowledge.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const language = c.req.query('language') as 'de' | 'en' | undefined;
		const category = c.req.query('category');
		const tags = c.req.query('tags')?.split(',');
		const isActive = c.req.query('isActive') !== 'false'; // Default to true
		const limit = parseInt(c.req.query('limit') || '50');
		const offset = parseInt(c.req.query('offset') || '0');

		const result = await listNVCKnowledge({
			language,
			category,
			tags,
			isActive: isActive as boolean,
			limit,
			offset
		});

		return c.json(result);
	} catch (error) {
		console.error('Error listing NVC knowledge:', error);
		return c.json({ error: 'Failed to list NVC knowledge' }, 500);
	}
});

// GET /api/nvc-knowledge/:id - Get single entry
nvcKnowledge.get('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');
		const entry = await getNVCKnowledgeEntry(id);

		if (!entry) {
			return c.json({ error: 'Entry not found' }, 404);
		}

		return c.json(entry);
	} catch (error) {
		console.error('Error getting NVC knowledge entry:', error);
		return c.json({ error: 'Failed to get NVC knowledge entry' }, 500);
	}
});

// POST /api/nvc-knowledge - Create new entry
nvcKnowledge.post('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Check admin access for creation
	if (!isAdmin(user)) {
		return c.json({ error: 'Admin access required' }, 403);
	}

	try {
		const body = await c.req.json() as CreateNVCKnowledgeInput;
		
		// Validate required fields
		if (!body.title || !body.content || !body.category || !body.language) {
			return c.json({ error: 'Missing required fields: title, content, category, language' }, 400);
		}

		// Validate language
		if (body.language !== 'de' && body.language !== 'en') {
			return c.json({ error: 'Language must be "de" or "en"' }, 400);
		}

		const entry = await createNVCKnowledgeEntry({
			...body,
			createdBy: user.id
		});

		return c.json(entry, 201);
	} catch (error) {
		console.error('Error creating NVC knowledge entry:', error);
		return c.json({ error: 'Failed to create NVC knowledge entry' }, 500);
	}
});

// PUT /api/nvc-knowledge/:id - Update entry
nvcKnowledge.put('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Check admin access for updates
	if (!isAdmin(user)) {
		return c.json({ error: 'Admin access required' }, 403);
	}

	try {
		const id = c.req.param('id');
		const body = await c.req.json() as Partial<CreateNVCKnowledgeInput & { isActive?: boolean }>;

		// Validate language if provided
		if (body.language && body.language !== 'de' && body.language !== 'en') {
			return c.json({ error: 'Language must be "de" or "en"' }, 400);
		}

		const entry = await updateNVCKnowledgeEntry(id, body);

		return c.json(entry);
	} catch (error: any) {
		if (error.message === 'Entry not found') {
			return c.json({ error: 'Entry not found' }, 404);
		}
		console.error('Error updating NVC knowledge entry:', error);
		return c.json({ error: 'Failed to update NVC knowledge entry' }, 500);
	}
});

// DELETE /api/nvc-knowledge/:id - Delete entry (soft delete by default)
nvcKnowledge.delete('/:id', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Check admin access for deletion
	if (!isAdmin(user)) {
		return c.json({ error: 'Admin access required' }, 403);
	}

	try {
		const id = c.req.param('id');
		const hardDelete = c.req.query('hard') === 'true';

		await deleteNVCKnowledgeEntry(id, hardDelete);

		return c.json({ success: true });
	} catch (error: any) {
		if (error.message === 'Entry not found') {
			return c.json({ error: 'Entry not found' }, 404);
		}
		console.error('Error deleting NVC knowledge entry:', error);
		return c.json({ error: 'Failed to delete NVC knowledge entry' }, 500);
	}
});

// POST /api/nvc-knowledge/:id/duplicate - Duplicate entry
nvcKnowledge.post('/:id/duplicate', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Check admin access
	if (!isAdmin(user)) {
		return c.json({ error: 'Admin access required' }, 403);
	}

	try {
		const id = c.req.param('id');
		const existing = await getNVCKnowledgeEntry(id);

		if (!existing) {
			return c.json({ error: 'Entry not found' }, 404);
		}

		const newEntry = await createNVCKnowledgeEntry({
			knowledgeId: existing.knowledgeId,
			language: existing.language,
			title: `${existing.title} (Copy)`,
			content: existing.content,
			category: existing.category,
			subcategory: existing.subcategory,
			source: existing.source,
			tags: existing.tags || undefined,
			priority: existing.priority,
			createdBy: user.id,
			generateEmbedding: true
		});

		return c.json(newEntry, 201);
	} catch (error) {
		console.error('Error duplicating NVC knowledge entry:', error);
		return c.json({ error: 'Failed to duplicate NVC knowledge entry' }, 500);
	}
});

// POST /api/nvc-knowledge/search - Semantic search
nvcKnowledge.post('/search', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json() as { query: string } & SearchOptions;

		if (!body.query) {
			return c.json({ error: 'Query is required' }, 400);
		}

		const results = await searchNVCKnowledge(body.query, {
			language: body.language,
			category: body.category,
			limit: body.limit || 10,
			minSimilarity: body.minSimilarity || 0.7,
			tags: body.tags
		});

		return c.json({ results });
	} catch (error) {
		console.error('Error searching NVC knowledge:', error);
		return c.json({ error: 'Failed to search NVC knowledge' }, 500);
	}
});

// POST /api/nvc-knowledge/retrieve-from-message - AI-powered retrieval from chat message
nvcKnowledge.post('/retrieve-from-message', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const body = await c.req.json() as {
			message: string;
			locale?: string;
			limit?: number;
			minSimilarity?: number;
			category?: string;
			tags?: string[];
		};

		if (!body.message) {
			return c.json({ error: 'Message is required' }, 400);
		}

		const result = await retrieveNVCKnowledge(body.message, body.locale || 'de', {
			limit: body.limit,
			minSimilarity: body.minSimilarity,
			category: body.category,
			tags: body.tags
		});

		return c.json(result);
	} catch (error) {
		console.error('Error retrieving NVC knowledge from message:', error);
		return c.json({ error: 'Failed to retrieve NVC knowledge' }, 500);
	}
});

// GET /api/nvc-knowledge/:id/similar - Find similar entries
nvcKnowledge.get('/:id/similar', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');
		const limit = parseInt(c.req.query('limit') || '5');

		const results = await findSimilarNVCKnowledge(id, limit);

		return c.json({ results });
	} catch (error) {
		console.error('Error finding similar NVC knowledge:', error);
		return c.json({ error: 'Failed to find similar NVC knowledge' }, 500);
	}
});

// GET /api/nvc-knowledge/:id/translations - Get translations
nvcKnowledge.get('/:id/translations', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const id = c.req.param('id');
		const entry = await getNVCKnowledgeEntry(id);

		if (!entry || !entry.knowledgeId) {
			return c.json({ error: 'Entry not found or has no knowledgeId' }, 404);
		}

		const translations = await getNVCKnowledgeTranslations(entry.knowledgeId);

		return c.json({ translations });
	} catch (error) {
		console.error('Error getting NVC knowledge translations:', error);
		return c.json({ error: 'Failed to get translations' }, 500);
	}
});

// GET /api/nvc-knowledge/categories - List all categories
nvcKnowledge.get('/meta/categories', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const categories = await getNVCCategories();
		return c.json({ categories });
	} catch (error) {
		console.error('Error getting categories:', error);
		return c.json({ error: 'Failed to get categories' }, 500);
	}
});

// GET /api/nvc-knowledge/tags - List all tags
nvcKnowledge.get('/meta/tags', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const tags = await getNVCTags();
		return c.json({ tags });
	} catch (error) {
		console.error('Error getting tags:', error);
		return c.json({ error: 'Failed to get tags' }, 500);
	}
});

// GET /api/nvc-knowledge/stats - Analytics data
nvcKnowledge.get('/meta/stats', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Check admin access for stats
	if (!isAdmin(user)) {
		return c.json({ error: 'Admin access required' }, 403);
	}

	try {
		// Get basic stats
		const allEntries = await listNVCKnowledge({ isActive: true, limit: 10000 });
		const deEntries = await listNVCKnowledge({ language: 'de', isActive: true, limit: 10000 });
		const enEntries = await listNVCKnowledge({ language: 'en', isActive: true, limit: 10000 });
		const categories = await getNVCCategories();

		// Count by category
		const categoryCounts: Record<string, number> = {};
		for (const category of categories) {
			const categoryEntries = await listNVCKnowledge({ category, isActive: true, limit: 10000 });
			categoryCounts[category] = categoryEntries.total;
		}

		return c.json({
			total: allEntries.total,
			byLanguage: {
				de: deEntries.total,
				en: enEntries.total
			},
			byCategory: categoryCounts,
			categories: categories.length
		});
	} catch (error) {
		console.error('Error getting stats:', error);
		return c.json({ error: 'Failed to get stats' }, 500);
	}
});

export default nvcKnowledge;

