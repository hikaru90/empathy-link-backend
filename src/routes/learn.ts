import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
	learnCategories,
	learnTopics,
	learnTopicVersions
} from '../../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);
const learn = new Hono();

function ensureAdmin(c: Context) {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	if (user.role !== 'admin') {
		return c.json({ error: 'Forbidden' }, 403);
	}
	return null;
}

const slugify = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');

/**
 * Category Routes
 */
learn.get('/categories', async (c) => {
	const rows = await db
		.select()
		.from(learnCategories)
		.orderBy(asc(learnCategories.sortOrder), asc(learnCategories.nameDE));

	return c.json({ categories: rows });
});

learn.post('/categories', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const body = await c.req.json();
	const nameDE = (body.nameDE || '').trim();

	if (!nameDE) {
		return c.json({ error: 'nameDE is required' }, 400);
	}

	const slug = body.slug ? slugify(body.slug) : slugify(nameDE);

	const [category] = await db
		.insert(learnCategories)
		.values({
			slug,
			nameDE,
			nameEN: body.nameEN?.trim() || null,
			descriptionDE: body.descriptionDE?.trim() || null,
			descriptionEN: body.descriptionEN?.trim() || null,
			color: body.color?.trim() || null,
			icon: body.icon?.trim() || null,
			sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
			isActive: body.isActive !== false
		})
		.returning();

	return c.json({ category }, 201);
});

learn.put('/categories/:id', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();
	const body = await c.req.json();

	const updates: any = {
		updated: new Date().toISOString()
	};

	if (body.slug) updates.slug = slugify(body.slug);
	if (body.nameDE !== undefined) updates.nameDE = body.nameDE?.trim() || null;
	if (body.nameEN !== undefined) updates.nameEN = body.nameEN?.trim() || null;
	if (body.descriptionDE !== undefined) updates.descriptionDE = body.descriptionDE?.trim() || null;
	if (body.descriptionEN !== undefined) updates.descriptionEN = body.descriptionEN?.trim() || null;
	if (body.color !== undefined) updates.color = body.color?.trim() || null;
	if (body.icon !== undefined) updates.icon = body.icon?.trim() || null;
	if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0;
	if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

	const [category] = await db
		.update(learnCategories)
		.set(updates)
		.where(eq(learnCategories.id, id))
		.returning();

	if (!category) {
		return c.json({ error: 'Category not found' }, 404);
	}

	return c.json({ category });
});

learn.delete('/categories/:id', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();

	const [category] = await db
		.delete(learnCategories)
		.where(eq(learnCategories.id, id))
		.returning();

	if (!category) {
		return c.json({ error: 'Category not found' }, 404);
	}

	return c.json({ success: true });
});

/**
 * Topic Routes
 */

learn.get('/topics', async (c) => {
	const categoryId = c.req.query('categoryId');
	const includeInactive = c.req.query('includeInactive') === 'true';
	const includeVersions = c.req.query('includeVersions') === 'true';

	let query = db
		.select({
			topic: learnTopics,
			category: learnCategories
		})
		.from(learnTopics)
		.leftJoin(learnCategories, eq(learnTopics.categoryId, learnCategories.id))
		.orderBy(asc(learnTopics.order), asc(learnTopics.created));

	const conditions = [];
	if (categoryId) {
		conditions.push(eq(learnTopics.categoryId, categoryId));
	}
	if (!includeInactive) {
		conditions.push(eq(learnTopics.isActive, true));
	}
	if (conditions.length > 0) {
		query = query.where(and(...conditions));
	}

	const rows = await query;

	const topics = rows.map((row) => ({
		...row.topic,
		category: row.category || null
	}));

	if (includeVersions && topics.length > 0) {
		const topicIds = topics.map((t) => t.id);
		const versions = await db
			.select()
			.from(learnTopicVersions)
			.where(inArray(learnTopicVersions.topicId, topicIds))
			.orderBy(desc(learnTopicVersions.created));

		const grouped = versions.reduce<Record<string, any[]>>((acc, version) => {
			if (!acc[version.topicId]) {
				acc[version.topicId] = [];
			}
			acc[version.topicId].push(version);
			return acc;
		}, {});

		return c.json({
			topics: topics.map((topic) => ({
				...topic,
				versions: grouped[topic.id] || []
			}))
		});
	}

	return c.json({ topics });
});

learn.get('/topics/:id', async (c) => {
	const { id } = c.req.param();

	const [row] = await db
		.select({
			topic: learnTopics,
			category: learnCategories
		})
		.from(learnTopics)
		.leftJoin(learnCategories, eq(learnTopics.categoryId, learnCategories.id))
		.where(eq(learnTopics.id, id));

	if (!row) {
		return c.json({ error: 'Topic not found' }, 404);
	}

	const versions = await db
		.select()
		.from(learnTopicVersions)
		.where(eq(learnTopicVersions.topicId, id))
		.orderBy(desc(learnTopicVersions.created));

	return c.json({
		topic: {
			...row.topic,
			category: row.category || null,
			versions
		}
	});
});

learn.post('/topics', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const body = await c.req.json();
	const slug = body.slug ? slugify(body.slug) : slugify(body.summaryDE || body.summaryEN || body.name || '');

	if (!slug) {
		return c.json({ error: 'slug or title is required' }, 400);
	}

	const [topic] = await db
		.insert(learnTopics)
		.values({
			slug,
			categoryId: body.categoryId || null,
			order: Number.isFinite(body.order) ? Number(body.order) : 0,
			difficulty: body.difficulty || null,
			level: body.level || null,
			estimatedMinutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : null,
			summaryDE: body.summaryDE || null,
			summaryEN: body.summaryEN || null,
			coverImage: body.coverImage || null,
			isActive: body.isActive !== false,
			isFeatured: Boolean(body.isFeatured),
			tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags || null
		})
		.returning();

	return c.json({ topic }, 201);
});

learn.put('/topics/:id', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();
	const body = await c.req.json();

	const updates: any = {
		updated: new Date().toISOString()
	};

	if (body.slug !== undefined) updates.slug = slugify(body.slug);
	if (body.categoryId !== undefined) updates.categoryId = body.categoryId || null;
	if (body.order !== undefined) updates.order = Number(body.order) || 0;
	if (body.difficulty !== undefined) updates.difficulty = body.difficulty || null;
	if (body.level !== undefined) updates.level = body.level || null;
	if (body.estimatedMinutes !== undefined) updates.estimatedMinutes = Number(body.estimatedMinutes) || null;
	if (body.summaryDE !== undefined) updates.summaryDE = body.summaryDE || null;
	if (body.summaryEN !== undefined) updates.summaryEN = body.summaryEN || null;
	if (body.coverImage !== undefined) updates.coverImage = body.coverImage || null;
	if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
	if (body.isFeatured !== undefined) updates.isFeatured = Boolean(body.isFeatured);
	if (body.tags !== undefined) {
		updates.tags = Array.isArray(body.tags) ? body.tags.join(',') : body.tags;
	}

	const [topic] = await db
		.update(learnTopics)
		.set(updates)
		.where(eq(learnTopics.id, id))
		.returning();

	if (!topic) {
		return c.json({ error: 'Topic not found' }, 404);
	}

	return c.json({ topic });
});

learn.delete('/topics/:id', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();

	const [topic] = await db
		.delete(learnTopics)
		.where(eq(learnTopics.id, id))
		.returning();

	if (!topic) {
		return c.json({ error: 'Topic not found' }, 404);
	}

	return c.json({ success: true });
});

learn.post('/topics/:id/current-version', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();
	const body = await c.req.json();
	const versionId = body.versionId;

	if (!versionId) {
		return c.json({ error: 'versionId is required' }, 400);
	}

	const [version] = await db
		.select()
		.from(learnTopicVersions)
		.where(and(eq(learnTopicVersions.id, versionId), eq(learnTopicVersions.topicId, id)));

	if (!version) {
		return c.json({ error: 'Version not found for topic' }, 404);
	}

	await db
		.update(learnTopics)
		.set({
			currentVersionId: versionId,
			updated: new Date().toISOString()
		})
		.where(eq(learnTopics.id, id));

	return c.json({ success: true });
});

/**
 * Topic Versions
 */
learn.get('/topics/:id/versions', async (c) => {
	const { id } = c.req.param();

	const versions = await db
		.select()
		.from(learnTopicVersions)
		.where(eq(learnTopicVersions.topicId, id))
		.orderBy(desc(learnTopicVersions.created));

	return c.json({ versions });
});

learn.post('/topics/:id/versions', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { id } = c.req.param();
	const body = await c.req.json();

	const [topic] = await db.select().from(learnTopics).where(eq(learnTopics.id, id));
	if (!topic) {
		return c.json({ error: 'Topic not found' }, 404);
	}

	if (!body.titleDE && !body.titleEN) {
		return c.json({ error: 'At least one title is required' }, 400);
	}

	const [version] = await db
		.insert(learnTopicVersions)
		.values({
			topicId: id,
			categoryId: body.categoryId || topic.categoryId || null,
			versionLabel: body.versionLabel || null,
			titleDE: body.titleDE || body.titleEN || 'Untitled',
			titleEN: body.titleEN || null,
			descriptionDE: body.descriptionDE || null,
			descriptionEN: body.descriptionEN || null,
			language: body.language || 'de',
			image: body.image || null,
			content: body.content || [],
			status: body.status || 'draft',
			isPublished: body.isPublished || false,
			publishedAt: body.isPublished ? new Date().toISOString() : null,
			createdBy: c.get('user')?.id || null,
			notes: body.notes || null,
			metadata: body.metadata || null
		})
		.returning();

	if (body.setCurrent === true) {
		await db
			.update(learnTopics)
			.set({
				currentVersionId: version.id,
				updated: new Date().toISOString()
			})
			.where(eq(learnTopics.id, id));
	}

	return c.json({ version }, 201);
});

learn.put('/topic-versions/:versionId', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { versionId } = c.req.param();
	const body = await c.req.json();

	const updates: any = {
		updated: new Date().toISOString()
	};

	const fields = [
		'titleDE',
		'titleEN',
		'descriptionDE',
		'descriptionEN',
		'language',
		'image',
		'status',
		'versionLabel',
		'notes'
	];

	for (const field of fields) {
		if (body[field] !== undefined) {
			updates[field] = body[field];
		}
	}

	if (body.content !== undefined) {
		updates.content = body.content;
	}
	if (body.metadata !== undefined) {
		updates.metadata = body.metadata;
	}
	if (body.categoryId !== undefined) {
		updates.categoryId = body.categoryId || null;
	}
	if (body.isPublished !== undefined) {
		updates.isPublished = Boolean(body.isPublished);
		updates.publishedAt = body.isPublished ? new Date().toISOString() : null;
	}

	const [version] = await db
		.update(learnTopicVersions)
		.set(updates)
		.where(eq(learnTopicVersions.id, versionId))
		.returning();

	if (!version) {
		return c.json({ error: 'Version not found' }, 404);
	}

	return c.json({ version });
});

learn.delete('/topic-versions/:versionId', async (c) => {
	const guard = ensureAdmin(c);
	if (guard) return guard;

	const { versionId } = c.req.param();

	const [version] = await db
		.delete(learnTopicVersions)
		.where(eq(learnTopicVersions.id, versionId))
		.returning();

	if (!version) {
		return c.json({ error: 'Version not found' }, 404);
	}

	// Remove current version reference if needed
	await db
		.update(learnTopics)
		.set({ currentVersionId: null })
		.where(eq(learnTopics.currentVersionId, versionId));

	return c.json({ success: true });
});

export default learn;

